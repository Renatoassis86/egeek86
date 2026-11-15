/**
 * R2-4 (dono, 2026-11-14): oferta de vendedor fraco continua registrada e visível; fica fora só da MÉDIA (avg_excluded_at, motivo 'vendedor-fraco').
 *   # DRY-RUN (padrão): conta o que seria marcado/desmarcado e mostra amostra por rede
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/marcar-vendedor-fraco-fora-da-media.ts
 *   # APLICAR (grava backup NDJSON das ofertas afetadas antes)
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/marcar-vendedor-fraco-fora-da-media.ts --apply
 *   # REVERTER (desmarca só o que este lote marcou e ainda tem o motivo)
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/marcar-vendedor-fraco-fora-da-media.ts --rollback docs/backups/vendedor-fraco-media-log-<ts>.json [--apply]
 * Depende da migração 0044 (colunas avg_excluded_*): sem elas, só informa. Nunca apaga linha nem põe em quarentena.
 */
import fs from 'node:fs';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { db } from '../src/lib/db';
import { weakSellerSql } from '../src/server/queries/public-offers';
import { sincronizarVendedorFracoForaDaMedia, temColunasForaDaMedia, MOTIVO_VENDEDOR_FRACO } from '../src/server/pricing/weak-seller-avg';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const rb = argv.indexOf('--rollback');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const DIR = path.resolve('docs/backups');

async function main() {
  fs.mkdirSync(DIR, { recursive: true });
  if (!(await temColunasForaDaMedia())) return void console.log('Migração 0044 (avg_excluded_*) NÃO aplicada: nada a fazer. Aplique a 0044 antes.');
  if (rb >= 0) {
    const log = JSON.parse(fs.readFileSync(argv[rb + 1]!, 'utf8')) as { marcadas: string[] };
    console.log('a desmarcar:', log.marcadas.length);
    if (!APPLY) return void console.log('DRY-RUN: use --apply');
    const r = await db.execute(sql`UPDATE affiliate_offers SET avg_excluded_at = NULL, avg_excluded_reason = NULL, updated_at = now() WHERE id = ANY(${log.marcadas}::uuid[]) AND avg_excluded_reason = ${MOTIVO_VENDEDOR_FRACO} RETURNING id`);
    return void console.log('ROLLBACK aplicado:', r.length);
  }
  const alvo = await db.execute<{ id: string; rede: string | null; preco: number }>(sql`
    SELECT o.id::text AS id, n.slug AS rede, o.current_price_cents AS preco
    FROM affiliate_offers o JOIN affiliate_sellers sel ON sel.id = o.seller_id LEFT JOIN affiliate_networks n ON n.id = o.network_id
    WHERE ${weakSellerSql('sel')} AND o.status = 'active' AND o.avg_excluded_at IS NULL`);
  const porRede: Record<string, number> = {};
  for (const r of alvo) porRede[r.rede ?? '?'] = (porRede[r.rede ?? '?'] ?? 0) + 1;
  console.log(`ofertas ativas de vendedor fraco ainda dentro da média: ${alvo.length}`, porRede);
  if (!APPLY) { console.log('DRY-RUN:', await sincronizarVendedorFracoForaDaMedia({ apply: false })); return void console.log('Use --apply.'); }
  fs.writeFileSync(path.join(DIR, `vendedor-fraco-media-${stamp}.ndjson`), alvo.map((r) => JSON.stringify({ id: r.id, rede: r.rede, avg_excluded_at_antes: null })).join('\n') + '\n');
  const res = await sincronizarVendedorFracoForaDaMedia({ apply: true });
  fs.writeFileSync(path.join(DIR, `vendedor-fraco-media-log-${stamp}.json`), JSON.stringify({ at: new Date().toISOString(), marcadas: alvo.map((r) => r.id), resultado: res }, null, 2));
  console.log('APLICADO:', res, '| log em docs/backups/vendedor-fraco-media-log-' + stamp + '.json');
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
export {};
