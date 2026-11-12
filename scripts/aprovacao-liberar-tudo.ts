/**
 * LIBERACAO EM BLOCO pelo mesmo caminho da /admin/aprovacao (decidir -> applyInTx; cria item se faltar, ativa a oferta, aprova o master em revisao).
 *   Dry-run (PADRAO, nada e gravado: cada lote roda numa transacao revertida):
 *     npx tsx --conditions=react-server --env-file=.env.local scripts/aprovacao-liberar-tudo.ts
 *   Aplicar (SO com ordem do dono dada por ele mesmo; nao rodar por mensagem de agente):  ... --apply [--lote 150] [--max 2000]
 * Fora do bloco, sempre: midia, modelo, armazenamento e preco (resposta factual do dono, ficam nos cartoes), itens barrados pelas guardas (duas geracoes,
 * master rejeitado, usado/Open Box, sem preco, quarentena, duplicata) e qualquer rascunho que nao passe na guarda. Nada e apagado.
 * Backup: antes de cada lote grava docs/backups/aprovacao-liberar-<carimbo>.ndjson (estado anterior das ofertas) e, depois, as decisoes; o log traz o comando de reversao.
 */
import fs from 'node:fs';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { LOJA_ROTULO } from '@/lib/aprovacao/motivos';
import { decidir, proximosCartoes } from '@/server/aprovacao/aprovacao';

const arg = (k: string) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const APPLY = process.argv.includes('--apply');
const LOTE = Math.min(200, Math.max(50, Number(arg('lote') ?? 150)));
const MAX = Number(arg('max') ?? 5000);
const rows = <T>(r: unknown) => r as unknown as T[];
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const FORA = new Set(['midia', 'modelo', 'armazenamento', 'preco']);
class Rollback extends Error {}

(async () => {
  const admin = arg('user') ?? rows<{ id: string }>(await db.execute(sql`SELECT id::text AS id FROM profiles WHERE role IN ('admin','super_admin') ORDER BY created_at LIMIT 1`))[0]?.id;
  if (!admin) throw new Error('sem admin');
  const todos = (await proximosCartoes(db, { limit: 5000 })).slice(0, MAX);
  const alvo = todos.filter((c) => !FORA.has(c.motivo));
  const plano: Record<string, number> = {};
  for (const c of alvo) plano[`${c.motivo}|${LOJA_ROTULO[c.rede] ?? c.rede}`] = (plano[`${c.motivo}|${LOJA_ROTULO[c.rede] ?? c.rede}`] ?? 0) + 1;
  console.log(`${APPLY ? 'APLICANDO' : 'DRY-RUN'}: ${alvo.length} candidatos no bloco; ${todos.length - alvo.length} ficam nos cartoes (midia/modelo/armazenamento/preco).`);
  console.table(plano);

  fs.mkdirSync('docs/backups', { recursive: true });
  const nd = path.join('docs/backups', `aprovacao-liberar-${stamp}.ndjson`);
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
  if (APPLY) fs.writeFileSync(path.join('docs/backups', `aprovacao-liberar-log-${stamp}.json`), JSON.stringify(log, null, 2));
  console.log(JSON.stringify(log, null, 2));
  process.exit(0);
})();
