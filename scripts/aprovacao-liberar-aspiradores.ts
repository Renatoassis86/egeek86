/**
 * LIBERACAO EM BLOCO SO DE ASPIRADORES (dono, 2026-11-17: "Pegue os aspiradores de todas as lojas"). Mesmo caminho da /admin/aprovacao (decidir -> applyInTx),
 * com backup e reversao identicos a scripts/aprovacao-liberar-tudo.ts. Restricoes proprias:
 *   - so cartoes cujo titulo ou master e ASPIRADOR (qualquer tipo: robo, vertical, sem fio, de po, portatil, de carro, de agua e extratora);
 *   - fora: pecas e acessorios (filtro, reservatorio, escova, saco, bateria, refil, mop, pano, mangueira, bocal, tubo, kit de reposicao...), preco < R$ 60;
 *   - fora (continuam nos cartoes para o dono): duvida de marca, duvida de voltagem, midia, modelo, armazenamento e preco.
 *   Dry-run (PADRAO, nada e gravado):  npx tsx --conditions=react-server --env-file=.env.local scripts/aprovacao-liberar-aspiradores.ts
 *   Aplicar:                          ... --apply [--lote 100]
 */
import fs from 'node:fs';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { LOJA_ROTULO } from '@/lib/aprovacao/motivos';
import { decidir, proximosCartoes, type Cartao } from '@/server/aprovacao/aprovacao';

const arg = (k: string) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const APPLY = process.argv.includes('--apply');
const LOTE = Math.min(150, Math.max(20, Number(arg('lote') ?? 100)));
const rows = <T>(r: unknown) => r as unknown as T[];
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const FORA = new Set(['midia', 'modelo', 'armazenamento', 'preco']);
class Rollback extends Error {}

const ASPIRADOR = /aspirador|aspira[cç][aã]o rob|rob[oô] aspirador|rob[oô] vacuum|vacuum cleaner/i;
const PECA = /\b(filtro|filtros|reservat[oó]rio|escova|escovas|saco|sacos|bateria|refil|mop|pano|panos|mangueira|bocal|tubo|extens[aã]o|cabo|carregador|base de carga|suporte|compat[ií]vel|sobressalente|pe[cç]a|pe[cç]as|reposi[cç][aã]o|kit de|acess[oó]rio|acess[oó]rios|rolo|lavavel|lav[aá]vel hepa|capa|adaptador|conector|motor|tampa)\b/i;
const DUVIDA = /duvida:|voltagem|marca_do_master_desconhecida/i;
const PRECO_MIN = 6000;

export function ehAspiradorDeVerdade(c: Pick<Cartao, 'title' | 'masterName' | 'priceCents' | 'reason'>): boolean {
  const t = `${c.title} ${c.masterName ?? ''}`;
  if (!ASPIRADOR.test(t)) return false;
  if (PECA.test(c.title) && !/aspirador de p[oó] (com fio|sem fio|rob|port|vertical)|rob[oô] aspirador/i.test(c.title)) return false;
  if ((c.priceCents ?? 0) < PRECO_MIN) return false;
  if (DUVIDA.test(c.reason ?? '')) return false;
  return true;
}

(async () => {
  const admin = arg('user') ?? rows<{ id: string }>(await db.execute(sql`SELECT id::text AS id FROM profiles WHERE role IN ('admin','super_admin') ORDER BY created_at LIMIT 1`))[0]?.id;
  if (!admin) throw new Error('sem admin');
  const todos = await proximosCartoes(db, { limit: 5000 });
  const asp = todos.filter((c) => ASPIRADOR.test(`${c.title} ${c.masterName ?? ''}`));
  const alvo = asp.filter((c) => !FORA.has(c.motivo) && ehAspiradorDeVerdade(c));
  const barrados = asp.filter((c) => !alvo.includes(c));
  const plano: Record<string, number> = {};
  for (const c of alvo) plano[`${LOJA_ROTULO[c.rede] ?? c.rede}`] = (plano[`${LOJA_ROTULO[c.rede] ?? c.rede}`] ?? 0) + 1;
  const razao: Record<string, number> = {};
  for (const c of barrados) {
    const r = FORA.has(c.motivo) ? `motivo:${c.motivo}` : PECA.test(c.title) ? 'peca/acessorio' : (c.priceCents ?? 0) < PRECO_MIN ? 'preco<60' : DUVIDA.test(c.reason ?? '') ? 'duvida marca/voltagem' : 'outro';
    razao[r] = (razao[r] ?? 0) + 1;
  }
  console.log(`${APPLY ? 'APLICANDO' : 'DRY-RUN'}: ${asp.length} cartoes de aspirador na fila; ${alvo.length} entram no bloco; ${barrados.length} ficam de fora.`);
  console.log('entram por loja', JSON.stringify(plano));
  console.log('ficam por razao', JSON.stringify(razao));
  console.log('amostra do que entra:\n' + alvo.slice(0, 8).map((c) => `  R$ ${((c.priceCents ?? 0) / 100).toFixed(2)} ${c.title.slice(0, 80)}`).join('\n'));
  console.log('amostra do que fica de fora:\n' + barrados.slice(0, 8).map((c) => `  R$ ${((c.priceCents ?? 0) / 100).toFixed(2)} ${c.title.slice(0, 70)} [${(c.reason ?? c.motivo).slice(0, 40)}]`).join('\n'));

  fs.mkdirSync('docs/backups', { recursive: true });
  const nd = path.join('docs/backups', `aprovacao-aspiradores-${stamp}.ndjson`);
  const out = { liberadas: 0, aprovadasOutras: 0, ja: 0, barradas: {} as Record<string, number>, erros: 0, porLoja: {} as Record<string, number> };
  for (let i = 0; i < alvo.length; i += LOTE) {
    const lote = alvo.slice(i, i + LOTE);
    if (APPLY) fs.appendFileSync(nd, lote.map((c) => JSON.stringify({ fase: 'antes', key: c.key, offerId: c.offerId, draft: c.draft, motivo: c.motivo })).join('\n') + '\n');
    const rodar = async (dbx: typeof db) => {
      for (const c of lote) {
        const r = await decidir(dbx, { key: c.key, acao: 'aprovar', userId: admin });
        if (!r.ok) { out.barradas[r.error ?? 'erro'] = (out.barradas[r.error ?? 'erro'] ?? 0) + 1; if (r.error === 'falha') out.erros++; continue; }
        if (r.already) { out.ja++; continue; }
        if (r.liberada) { out.liberadas++; out.porLoja[c.rede] = (out.porLoja[c.rede] ?? 0) + 1; } else out.aprovadasOutras++;
        if (APPLY && r.decisionId) fs.appendFileSync(nd, JSON.stringify({ fase: 'decisao', decision_id: r.decisionId, decided_by: admin, undone_at: null, key: c.key }) + '\n');
      }
    };
    if (APPLY) await rodar(db); else await db.transaction(async (tx) => { await rodar(tx as unknown as typeof db); throw new Rollback(); }).catch((e) => { if (!(e instanceof Rollback)) throw e; });
    console.log(`lote ${i / LOTE + 1}: ${JSON.stringify(out)}`);
    await new Promise((r) => setTimeout(r, 400));
  }
  const log = { stamp, modo: APPLY ? 'apply' : 'dry-run', ...out, arquivo: APPLY ? nd : null, reverter: APPLY ? `npx tsx --conditions=react-server --env-file=.env.local scripts/aprovacao-backup.ts --reverter ${nd} --apply` : null };
  if (APPLY) fs.writeFileSync(path.join('docs/backups', `aprovacao-aspiradores-log-${stamp}.json`), JSON.stringify(log, null, 2));
  console.log(JSON.stringify(log, null, 2));
  process.exit(0);
})();
