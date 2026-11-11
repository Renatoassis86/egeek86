import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { eligibleOfferSql } from '@/server/pricing/eligibility-sql';
import { recordPriceSnapshot } from '@/server/collector/record-price-snapshot';
import { getValidAccessToken } from '@/server/collector/sources/mercado-livre-auth';
import { lookupShopeeItem } from '@/server/collector/sources/shopee';
import { RULES } from '@/lib/messaging/group-rules';
import type { LiveDeps, LiveTarget } from '@/lib/messaging/live-recheck';

type Row = Record<string, unknown>;

const idList = (ids: string[]) => sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `);

/**
 * Ofertas a reconferir ao vivo: as do candidato ('original', com o preço detectado quando há) e as concorrentes ATIVAS do mesmo
 * produto que estão com o preço velho (mais de 30 min, dentro da janela de detecção) e custam até 2% acima do preço do candidato
 * (no máximo 4 por produto, as mais baratas). Sem isso uma concorrente mais barata, só por estar velha, sumiria da releitura e o
 * candidato viraria "o menor preço" sem ser.
 */
export async function loadLiveTargets(
  originals: Array<{ offerId: string; detectedPriceCents: number | null }>,
  productPriceCap: Map<string, number>,
  now: Date
): Promise<LiveTarget[]> {
  const ids = originals.map((o) => o.offerId);
  if (!ids.length) return [];
  const products = [...productPriceCap.keys()];
  const detectSince = new Date(now.getTime() - RULES.DETECT_MAX_AGE_MIN * 60_000).toISOString();
  const staleBefore = new Date(now.getTime() - RULES.LIVE_STALE_AFTER_MIN * 60_000).toISOString();
  const rows = await db.execute<Row>(sql`
    SELECT o.id, o.master_product_id, n.slug AS net_slug, n.name AS net_name, o.external_ref, o.external_item_id, o.affiliate_url,
           s.external_seller_id, o.current_price_cents, o.last_price_confirmed_at
    FROM affiliate_offers o
    INNER JOIN affiliate_networks n ON n.id = o.network_id
    LEFT JOIN affiliate_sellers s ON s.id = o.seller_id
    WHERE o.id IN (${idList(ids)})
       OR (${products.length ? sql`o.master_product_id IN (${idList(products)})` : sql`false`}
           AND o.status = 'active' AND o.quarantined_at IS NULL AND o.affiliate_link_pending = false AND o.current_price_cents > 0
           AND o.last_price_confirmed_at >= ${detectSince}::timestamptz AND o.last_price_confirmed_at < ${staleBefore}::timestamptz
           AND ${eligibleOfferSql('o')}
           AND (n.slug || ' ' || n.name) !~* 'amazon')
    ORDER BY o.current_price_cents
    LIMIT 200
  `);
  const detectedBy = new Map(originals.map((o) => [o.offerId, o.detectedPriceCents]));
  const perProduct = new Map<string, number>();
  const out: LiveTarget[] = [];
  for (const r of rows) {
    const offerId = String(r.id);
    const isOriginal = detectedBy.has(offerId);
    const mid = String(r.master_product_id);
    const price = Number(r.current_price_cents);
    if (!isOriginal) {
      const cap = productPriceCap.get(mid);
      if (cap == null || price > cap * (1 + RULES.SEND_PRICE_TOLERANCE_PCT / 100)) continue;
      const n = perProduct.get(mid) ?? 0;
      if (n >= RULES.LIVE_MAX_COMPETITORS_PER_PRODUCT) continue;
      perProduct.set(mid, n + 1);
    }
    out.push({
      offerId,
      role: isOriginal ? 'original' : 'competitor',
      masterProductId: mid,
      networkSlug: String(r.net_slug),
      networkName: String(r.net_name),
      externalRef: (r.external_ref as string | null) ?? null,
      externalItemId: (r.external_item_id as string | null) ?? null,
      affiliateUrl: (r.affiliate_url as string | null) ?? null,
      sellerExternalId: (r.external_seller_id as string | null) ?? null,
      storedPriceCents: price,
      confirmedAt: r.last_price_confirmed_at ? new Date(r.last_price_confirmed_at as string | Date) : null,
      detectedPriceCents: isOriginal ? (detectedBy.get(offerId) ?? null) : null,
    });
  }
  return out;
}

/**
 * Dependências reais da reconferência: fonte oficial do Mercado Livre (mesmo token da coleta), lookup oficial da Shopee e o
 * gravador do coletor (recordPriceSnapshot, source 'api') mais o carimbo last_price_confirmed_at (a API devolveu preço agora).
 */
export function realLiveDeps(): LiveDeps {
  return {
    meliToken: getValidAccessToken,
    shopeeLookup: async (itemId) => {
      const r = await lookupShopeeItem(itemId);
      return r.status === 'ok' ? { status: 'ok', priceCents: r.node.priceCents } : { status: 'unavailable', reason: r.reason };
    },
    record: async (t, priceCents) => {
      await recordPriceSnapshot({ offerId: t.offerId, priceCents, source: 'api' });
      await db.execute(sql`
        UPDATE affiliate_offers SET last_checked_at = now(), last_price_confirmed_at = now(), consecutive_miss_count = 0
        WHERE id = ${t.offerId}::uuid
      `);
    },
  };
}
