/**
 * Amostras REAIS dos cards v2 com capa recuperada e quadro branco (fila #65). SOMENTE LEITURA do banco; NÃO envia nada a canal/grupo.
 * Uso: npx tsx --conditions=react-server --env-file=.env.local scripts/render-amostras-capas-v2b.ts [pasta]
 * Saída: <pasta>/v2b-*.png (2 produtos dos prints do dono, 6 que saíam sem capa e 1 card sem capa em fundo branco).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';

export {};

async function main() {
  const out = process.argv[2] ?? 'docs/amostras-cards';
  mkdirSync(out, { recursive: true });
  const { db } = await import('../src/lib/db');
  const { loadOfferCardInput, renderOfferCard } = await import('../src/server/messaging/offer-card');
  const { drawOfferCardV2 } = await import('../src/server/messaging/card-v2');

  const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  async function amostra(offerId: string, prefixo: string): Promise<string | null> {
    const meta = await db.execute<Record<string, unknown>>(sql`SELECT COALESCE(last_price_confirmed_at, last_checked_at) AS t FROM affiliate_offers WHERE id = ${offerId}::uuid`);
    const t = meta[0]?.t ? new Date(meta[0].t as string | Date) : new Date();
    const input = await loadOfferCardInput(offerId, { now: new Date(t.getTime() + 60_000), simple: true });
    if (!input) return null;
    const r = await renderOfferCard(input);
    if (!r) return null;
    const file = `${prefixo}-${slug(input.title)}.png`;
    writeFileSync(join(out, file), r.png);
    console.log(file, `| capas candidatas: ${input.imageCandidates?.length ?? 0}`);
    return file;
  }

  // 1) Os dois produtos dos prints do dono (qualquer oferta ativa elegível do master)
  for (const [mid, tag] of [['07f08550', 'print-ocarina-switch2'], ['c6c9b020', 'print-echoes-of-wisdom'], ['600415a8', 'print-echoes-of-wisdom-2']] as const) {
    const offers = await db.execute<Record<string, unknown>>(sql`
      SELECT o.id FROM affiliate_offers o WHERE o.master_product_id::text LIKE ${mid + '%'} AND o.status = 'active' AND o.current_price_cents > 0
      ORDER BY (o.image_url !~* 'mlstatic|mercadolivre') DESC, o.last_checked_at DESC NULLS LAST LIMIT 15`);
    let ok: string | null = null;
    for (const o of offers) {
      ok = await amostra(String(o.id), `v2b-${tag}`);
      if (ok) break;
    }
    if (!ok) console.log('sem oferta elegível para', tag);
  }

  // 2) Seis ofertas que antes saíam sem capa (endereço de imagem de outra loja)
  const sem = await db.execute<Record<string, unknown>>(sql`
    SELECT DISTINCT ON (o.master_product_id) o.id FROM affiliate_offers o JOIN affiliate_networks n ON n.id = o.network_id
    WHERE o.status = 'active' AND n.slug = 'mercado-livre' AND o.image_url !~* 'mlstatic|mercadolivre' AND COALESCE(o.image_url, '') <> '' AND o.current_price_cents > 0
    ORDER BY o.master_product_id, o.last_checked_at DESC NULLS LAST LIMIT 40`);
  let n = 0;
  for (const o of sem) {
    if (n >= 6) break;
    if (await amostra(String(o.id), `v2b-antes-sem-capa-${n + 1}`)) n++;
  }

  // 3) Fallback (nada deu certo): título em destaque sobre quadro BRANCO
  const base = { title: 'The Legend of Zelda Echoes of Wisdom Nintendo Switch Mídia Física', platformLabel: 'Nintendo Switch', store: 'Mercado Livre', sellerName: 'Loja Exemplo', isAmazon: false, vertical: 'games', priceCents: 24990, checkedAt: new Date(), imageUrl: null, today: '2026-11-15', stats: { recordCents: null, seriesFirstDay: null, measuredDays: 0, avgCents: null, distinctOffers: 0, prev: null } };
  writeFileSync(join(out, 'v2b-fallback-sem-capa-fundo-branco.png'), await drawOfferCardV2(base, null, null));
  console.log('v2b-fallback-sem-capa-fundo-branco.png');
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
