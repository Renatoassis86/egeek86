/**
 * CORRECAO (dono, 2026-11-16): "Minimo R$ 1.999,99" no card do PS5 Slim Digital. Causa: um anuncio do vendedor MEAN5910225 (MLB-7502901706) a R$ 1.999,99
 * (metade do mercado, ~R$ 4.200+) e os placeholders do catalogo que herdaram esse menor preco geraram 102 cotacoes a 199999 (01 a 06/11) no master
 * 22c09745. Isca/erro de anuncio, nao preco real. Backup NDJSON (nunca apagar) e rollback.
 *   npx tsx --env-file=.env.local scripts/corrigir-cotacoes-isca-ps5-2026-11-16.ts            # dry-run
 *   npx tsx --env-file=.env.local scripts/corrigir-cotacoes-isca-ps5-2026-11-16.ts --apply
 *   npx tsx --env-file=.env.local scripts/corrigir-cotacoes-isca-ps5-2026-11-16.ts --rollback docs/backups/<arquivo>.ndjson
 */
import fs from 'node:fs';
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
const MASTER = '22c09745-2071-4983-94f7-08b0491fedbe';
const PRECOS = [199999, 250000];
const APPLY = process.argv.includes('--apply');
const rb = process.argv.indexOf('--rollback');

async function main() {
  if (rb > 0) {
    const linhas = fs.readFileSync(process.argv[rb + 1], 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    for (const l of linhas) {
      if (l.t === 'snap') await sql`INSERT INTO affiliate_price_snapshots (id, offer_id, price_cents, list_price_cents, discount_percent, coupon_code, collected_at, source, record_kind) VALUES (${l.r.id}, ${l.r.offer_id}, ${l.r.price_cents}, ${l.r.list_price_cents}, ${l.r.discount_percent}, ${l.r.coupon_code}, ${l.r.collected_at}, ${l.r.source}, ${l.r.record_kind}) ON CONFLICT DO NOTHING`;
    }
    console.log('rollback: snapshots reinseridos (price_daily_offer e estados se recalculam no proximo ciclo)', linhas.filter((l) => l.t === 'snap').length);
    return;
  }
  const snaps = await sql`SELECT s.* FROM affiliate_price_snapshots s JOIN affiliate_offers o ON o.id = s.offer_id WHERE o.master_product_id = ${MASTER} AND s.price_cents IN ${sql(PRECOS)}`;
  const ofertas = [...new Set(snaps.map((s) => s.offer_id as string))];
  const diarias = await sql`SELECT * FROM price_daily_offer WHERE master_product_id = ${MASTER} AND min_cents IN ${sql(PRECOS)}`;
  console.log(`cotacoes a ${PRECOS.join('|')}: ${snaps.length} em ${ofertas.length} ofertas; linhas oferta-dia a refazer: ${diarias.length}`);
  if (!APPLY) { console.log('dry-run: nada gravado'); return; }
  const arq = `docs/backups/cotacoes-isca-ps5-${new Date().toISOString().replace(/[:.]/g, '-')}.ndjson`;
  fs.writeFileSync(arq, [...snaps.map((r) => JSON.stringify({ t: 'snap', r })), ...diarias.map((r) => JSON.stringify({ t: 'dia', r }))].join('\n') + '\n');
  await sql.begin(async (tx) => {
    await tx`DELETE FROM affiliate_price_snapshots s USING affiliate_offers o WHERE o.id = s.offer_id AND o.master_product_id = ${MASTER} AND s.price_cents IN ${sql(PRECOS)}`;
    await tx`DELETE FROM price_daily_offer WHERE master_product_id = ${MASTER} AND min_cents IN ${sql(PRECOS)}`;
  });
  const { upsertOfferDays } = await import('../src/server/pricing/price-daily');
  const { db } = await import('../src/lib/db');
  for (const o of ofertas) await upsertOfferDays(db as never, '2026-10-30', '2026-11-16', o);
  const depois = await sql`SELECT min(min_cents)::int mn FROM price_daily_offer WHERE master_product_id = ${MASTER} AND day > current_date - 16`;
  console.log('backup:', arq, '| menor preco-dia 16 dias agora:', depois[0].mn);
}
main().then(() => sql.end()).then(() => process.exit(0));
