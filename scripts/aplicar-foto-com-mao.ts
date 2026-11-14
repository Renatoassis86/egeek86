/**
 * FOTO COM MÃO = alta chance de seminovo (dono, 2026-11-14): "se a foto do console ou jogo tiver uma mão segurando, não coloque".
 * Entrada: um ou mais JSON de classificação visual [{id, classe}] (classe 'mao' | 'sem_mao' | 'erro'). Só 'mao' é aplicado.
 *
 *   # DRY-RUN (padrão): lista os masters e o catalogGate atual
 *   npx tsx --env-file=.env.local scripts/aplicar-foto-com-mao.ts <resultado1.json> [<resultado2.json> ...]
 *   # APLICAR
 *   npx tsx --env-file=.env.local scripts/aplicar-foto-com-mao.ts <resultado*.json> --apply --por "Nome"
 *   # REVERTER (restaura o catalogGate anterior só de quem ainda tem a marca deste lote)
 *   npx tsx --env-file=.env.local scripts/aplicar-foto-com-mao.ts --rollback docs/backups/foto-com-mao-log-<ts>.json [--apply]
 *
 * Grava só master_products.attributes.catalogGate = rejected (out_of_scope, motivo foto_com_mao). Nunca apaga master, oferta ou histórico.
 * Não mexe em master com decisão humana (catalogGate.manual) nem em quem já está 'rejected'. Guarda otimista: só grava se o gate ainda é o lido.
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect } from './_dup-shared';
import { GATE_VERSION, type PersistedGate } from '../src/lib/catalog/gate';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const porIdx = argv.indexOf('--por');
const POR = porIdx >= 0 ? argv[porIdx + 1] : '';
const rbIdx = argv.indexOf('--rollback');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const DIR = path.resolve('docs/backups');

async function main() {
  fs.mkdirSync(DIR, { recursive: true });
  const sql = connect();
  try {
    if (rbIdx >= 0) {
      const log = JSON.parse(fs.readFileSync(argv[rbIdx + 1]!, 'utf8')) as { gravados: Array<{ id: string; antes: PersistedGate | null; depois: PersistedGate }> };
      console.log('a restaurar:', log.gravados.length);
      if (!APPLY) return void console.log('DRY-RUN: use --apply');
      for (const g of log.gravados) {
        if (g.antes) await sql`UPDATE master_products SET attributes = jsonb_set(attributes, '{catalogGate}', ${JSON.stringify(g.antes)}::text::jsonb, true) WHERE id = ${g.id}::uuid AND attributes -> 'catalogGate' ->> 'at' = ${g.depois.at}`;
        else await sql`UPDATE master_products SET attributes = attributes - 'catalogGate' WHERE id = ${g.id}::uuid AND attributes -> 'catalogGate' ->> 'at' = ${g.depois.at}`;
      }
      return void console.log('ROLLBACK aplicado.');
    }
    const files = argv.filter((a, i) => a.endsWith('.json') && argv[i - 1] !== '--rollback');
    const ids = new Set<string>();
    for (const f of files) for (const r of JSON.parse(fs.readFileSync(f, 'utf8')) as Array<{ id: string; classe: string }>) if (r.classe === 'mao') ids.add(r.id);
    if (!ids.size) return void console.log('nenhum item com mão.');
    const rows = await sql<{ id: string; name: string; gate: PersistedGate | null }[]>`SELECT id::text AS id, name, attributes -> 'catalogGate' AS gate FROM master_products WHERE id = ANY(${[...ids]}::uuid[])`;
    const alvo = rows.filter((r) => !r.gate?.manual && r.gate?.verdict !== 'rejected');
    console.log(`com mão: ${rows.length}; a rejeitar: ${alvo.length}; ignorados (decisão humana ou já rejeitados): ${rows.length - alvo.length}`);
    for (const r of alvo) console.log(`  ${r.id.slice(0, 8)} | gate=${r.gate?.verdict ?? '-'} | ${r.name.slice(0, 90)}`);
    if (!APPLY) return void console.log('DRY-RUN: nada gravado. Use --apply --por "Nome".');
    if (!POR) throw new Error('--por "Nome" é obrigatório com --apply');
    const at = new Date().toISOString();
    const depois: PersistedGate = { verdict: 'rejected', category: 'out_of_scope', reason: 'foto_com_mao', matched: 'foto_com_mao', version: GATE_VERSION, at };
    const bk = path.join(DIR, `foto-com-mao-${stamp}.ndjson`);
    fs.writeFileSync(bk, alvo.map((r) => JSON.stringify({ id: r.id, nome: r.name, catalogGateAnterior: r.gate })).join('\n') + '\n');
    const gravados: Array<{ id: string; antes: PersistedGate | null; depois: PersistedGate }> = [];
    for (const r of alvo) {
      const antes = r.gate ? JSON.stringify(r.gate) : null;
      const u = await sql`UPDATE master_products SET attributes = jsonb_set(COALESCE(attributes, '{}'::jsonb), '{catalogGate}', ${JSON.stringify(depois)}::text::jsonb, true)
                          WHERE id = ${r.id}::uuid AND COALESCE(attributes -> 'catalogGate', 'null'::jsonb) = COALESCE(${antes}::text::jsonb, 'null'::jsonb)`;
      if (u.count) gravados.push({ id: r.id, antes: r.gate, depois });
    }
    const logFile = path.join(DIR, `foto-com-mao-log-${stamp}.json`);
    fs.writeFileSync(logFile, JSON.stringify({ criadoEm: at, por: POR, backup: path.basename(bk), gravados, rollback: `npx tsx --env-file=.env.local scripts/aplicar-foto-com-mao.ts --rollback docs/backups/${path.basename(logFile)} --apply` }, null, 2));
    console.log(`GRAVADOS: ${gravados.length}/${alvo.length} | backup: ${bk} | log: ${logFile}`);
  } finally {
    await sql.end();
  }
}
main().catch((e) => { console.error('ERRO:', e instanceof Error ? e.message : String(e)); process.exit(1); });
