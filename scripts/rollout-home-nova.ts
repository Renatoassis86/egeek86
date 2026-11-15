/**
 * Rollout da home nova (dono, 2026-11-15): 10% em 19/11, 50% em 21/11, 100% em 22/11 de 2026 (fuso de Brasília), com rollback imediato.
 *
 * Como o rollout é controlado: linha `redesenho_home` de `feature_flags` (enabled + rollout_percentage), lida por
 * src/server/redesenho-home.ts com cache de 30 s por instância. enabled=false = 0% (home atual). Sem deploy.
 *
 *   # DRY-RUN (padrão): só lê e mostra o que faria
 *   npx tsx --env-file=.env.local scripts/rollout-home-nova.ts --etapa 10
 *   # APLICAR (recusa antes da data da etapa; --ignorar-data libera; recusa baixar o percentual: use --rollback)
 *   npx tsx --env-file=.env.local scripts/rollout-home-nova.ts --etapa 10 --apply
 *   # ROLLBACK imediato: enabled=false, rollout_percentage=0 (home atual em até 30 s)
 *   npx tsx --env-file=.env.local scripts/rollout-home-nova.ts --rollback --apply
 *
 * Pausa: criar o arquivo docs/backups/rollout-home-nova-PAUSA segura o avanço (agendamento incluso); apagar libera.
 * Idempotente: repetir a mesma etapa não muda nada. Backup do valor anterior em docs/backups/rollout-home-nova-backup-<ts>.json;
 * log append-only em docs/backups/rollout-home-nova-log.ndjson. Só toca a linha `redesenho_home`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect } from './_dup-shared';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const ROLLBACK = argv.includes('--rollback');
const IGNORAR_DATA = argv.includes('--ignorar-data');
const i = argv.indexOf('--etapa');
const ETAPA = i >= 0 ? Number(argv[i + 1]) : NaN;
const CHAVE = 'redesenho_home';
/** Etapa -> início (00:00 em Brasília, UTC-3, sem horário de verão desde 2019). */
const DATAS: Record<number, string> = { 10: '2026-11-19T00:00:00-03:00', 50: '2026-11-21T00:00:00-03:00', 100: '2026-11-22T00:00:00-03:00' };
const DIR = path.resolve('docs/backups');
const LOG = path.join(DIR, 'rollout-home-nova-log.ndjson');
/** Trava de segurança: se este arquivo existir, nenhuma etapa avança (o rollback continua permitido). Criar quando o QA ou as métricas falharem. */
const PAUSA = path.join(DIR, 'rollout-home-nova-PAUSA');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');

interface Linha { key: string; description: string | null; enabled: boolean; rollout_percentage: number | null; updated_at: string }
const efetivo = (l: Linha | null) => (l && l.enabled ? l.rollout_percentage ?? 0 : 0);
function registrar(o: Record<string, unknown>) {
  fs.mkdirSync(DIR, { recursive: true });
  fs.appendFileSync(LOG, JSON.stringify({ at: new Date().toISOString(), ...o }) + '\n');
}

async function main() {
  if (!ROLLBACK && !(ETAPA in DATAS)) throw new Error('use --etapa 10|50|100 ou --rollback');
  const sql = connect();
  try {
    const [atual] = await sql<Linha[]>`SELECT key, description, enabled, rollout_percentage, updated_at::text FROM feature_flags WHERE key = ${CHAVE}`;
    const antes = efetivo(atual ?? null);
    const alvo = ROLLBACK ? 0 : ETAPA;
    console.log(`Flag ${CHAVE}: ${atual ? `enabled=${atual.enabled}, rollout_percentage=${atual.rollout_percentage} (efetivo ${antes}%)` : 'linha inexistente (efetivo 0%, vale a env REDESENHO_HOME se houver)'}`);
    console.log(`Alvo: ${ROLLBACK ? 'ROLLBACK para 0% (enabled=false)' : `etapa ${ETAPA}%`}. Modo: ${APPLY ? 'APLICAR' : 'DRY-RUN'}.`);

    if (!ROLLBACK) {
      if (fs.existsSync(PAUSA)) {
        console.log(`PAUSADO: existe ${PAUSA}. Nenhuma etapa avança até remover o arquivo.`);
        registrar({ evento: 'recusado_pausa', etapa: ETAPA, apply: APPLY });
        if (APPLY) process.exitCode = 4;
        return;
      }
      const quando = new Date(DATAS[ETAPA]);
      if (Date.now() < quando.getTime() && !IGNORAR_DATA) {
        console.log(`Antes da data da etapa (${DATAS[ETAPA]}): ${APPLY ? 'RECUSADO' : 'o --apply seria recusado agora'} (use --ignorar-data só com ordem do dono).`);
        registrar({ evento: 'recusado_antes_da_data', etapa: ETAPA, apply: APPLY });
        if (APPLY) process.exitCode = 3;
        return;
      }
      if (alvo < antes) { console.log(`Percentual atual (${antes}%) é maior que a etapa: não baixo por aqui. Use --rollback.`); process.exitCode = 2; return; }
      if (alvo === antes && atual?.enabled) { console.log('Já está nesta etapa: nada a fazer.'); registrar({ evento: 'sem_mudanca', etapa: ETAPA }); return; }
    } else if (antes === 0 && atual && !atual.enabled) { console.log('Já está desligada (0%): nada a fazer.'); registrar({ evento: 'rollback_sem_mudanca' }); return; }

    if (!APPLY) { console.log(`DRY-RUN: gravaria enabled=${!ROLLBACK}, rollout_percentage=${alvo}. Nada foi alterado.`); return; }

    fs.mkdirSync(DIR, { recursive: true });
    const bkp = path.join(DIR, `rollout-home-nova-backup-${stamp}.json`);
    fs.writeFileSync(bkp, JSON.stringify({ chave: CHAVE, linhaAnterior: atual ?? null, efetivoAnterior: antes }, null, 2));
    if (ROLLBACK) {
      await sql`INSERT INTO feature_flags (key, description, enabled, rollout_percentage) VALUES (${CHAVE}, 'Nova home por percentual', false, 0)
                ON CONFLICT (key) DO UPDATE SET enabled = false, rollout_percentage = 0, updated_at = now()`;
    } else {
      await sql`INSERT INTO feature_flags (key, description, enabled, rollout_percentage) VALUES (${CHAVE}, 'Nova home por percentual', true, ${alvo})
                ON CONFLICT (key) DO UPDATE SET enabled = true, rollout_percentage = ${alvo}, updated_at = now()`;
    }
    const [depois] = await sql<Linha[]>`SELECT key, description, enabled, rollout_percentage, updated_at::text FROM feature_flags WHERE key = ${CHAVE}`;
    registrar({ evento: ROLLBACK ? 'rollback' : 'etapa', etapa: ROLLBACK ? 0 : ETAPA, antes: atual ?? null, depois, backup: bkp });
    console.log(`OK. Agora: enabled=${depois.enabled}, rollout_percentage=${depois.rollout_percentage}. Backup: ${bkp}. Vale em até 30 s por instância.`);
    console.log(`Para restaurar o valor anterior à mão: UPDATE feature_flags SET enabled=${atual?.enabled ?? false}, rollout_percentage=${atual?.rollout_percentage ?? 'NULL'} WHERE key='${CHAVE}';`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); registrar({ evento: 'erro', mensagem: e instanceof Error ? e.message : String(e) }); process.exit(1); });
