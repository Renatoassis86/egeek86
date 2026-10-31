import 'server-only';
import { fetchShopeeGraphQL, isShopeeAffiliateConfigured } from '@/server/collector/sources/shopee-auth';
import { normalizeStatus, parseIntSafe, parseMoneyToCents } from './normalize';
import type { NormalizedConversion } from './types';

/**
 * Importador de conversões da Shopee Affiliate Open API (query `conversionReport`).
 *
 * STATUS: código pronto, NUNCA executado contra a API real (sem credenciais
 * neste ambiente). O schema abaixo vem de documentação de terceiros
 * (affiliateshopee.com.br/documentacao, não oficial) e do help center da Shopee
 * (que confirma só a existência de conversion/validated reports). Conferir com
 * o schema real no primeiro uso (introspecção ou página oficial
 * affiliate.shopee.com.br/open_api, que exige login).
 *
 * Não documentado, tratado defensivamente:
 * - janela máxima de purchaseTimeStart/End: fatiamos em blocos de 1 dia;
 * - teto de `limit`: usamos 50 (valor dos exemplos);
 * - scrollId vale ~30 s: a próxima página é pedida imediatamente.
 */

export const SHOPEE_CONVERSION_FIELDS = `
  conversionId
  purchaseTime
  clickTime
  totalCommission
  buyerType
  device
  utmContent
  orders {
    orderId
    orderStatus
    items {
      itemId
      itemName
      shopName
      itemPrice
      qty
      itemTotalCommission
      attributionType
    }
  }
`;

const PAGE_LIMIT = 50;
const MAX_PAGES_PER_WINDOW = 200;
const DAY_S = 86_400;

function unixToDate(v: unknown): Date | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date((n > 1e12 ? n : n * 1000));
}

/** Converte um nó de conversionReport em uma linha por item. Pura, testável sem rede. */
export function normalizeShopeeConversionNode(node: any): NormalizedConversion[] {
  const out: NormalizedConversion[] = [];
  const conversionId = node?.conversionId != null ? String(node.conversionId) : null;
  if (!conversionId) return out;
  const purchaseAt = unixToDate(node.purchaseTime);
  const clickAt = unixToDate(node.clickTime);
  const subId = node.utmContent ? String(node.utmContent) : null;

  for (const order of Array.isArray(node.orders) ? node.orders : []) {
    const orderId = order?.orderId != null ? String(order.orderId) : null;
    const rawStatus = order?.orderStatus ? String(order.orderStatus) : null;
    const items = Array.isArray(order?.items) ? order.items : [];
    for (const it of items) {
      const itemId = it?.itemId != null && /^\d{1,19}$/.test(String(it.itemId)) ? String(it.itemId) : null;
      out.push({
        source: 'shopee_api',
        networkSlug: 'shopee',
        externalId: `${conversionId}:${orderId ?? ''}:${itemId ?? it?.itemName ?? ''}`,
        orderId,
        orderStatus: normalizeStatus(rawStatus),
        rawStatus,
        clickAt,
        purchaseAt,
        itemRef: itemId ? `shopee-${itemId}` : null,
        itemName: it?.itemName ? String(it.itemName) : null,
        quantity: parseIntSafe(it?.qty),
        itemPriceCents: parseMoneyToCents(it?.itemPrice),
        commissionCents: parseMoneyToCents(it?.itemTotalCommission),
        netCommissionCents: null,
        refundCents: null,
        subId,
        attributionType: it?.attributionType != null ? String(it.attributionType) : null,
        raw: { conversionId, buyerType: node.buyerType ?? null, device: node.device ?? null, shopName: it?.shopName ?? null },
      });
    }
  }
  return out;
}

async function fetchWindow(startS: number, endS: number): Promise<NormalizedConversion[]> {
  const rows: NormalizedConversion[] = [];
  let scrollId: string | null = null;
  for (let page = 0; page < MAX_PAGES_PER_WINDOW; page++) {
    const query = `
      query Conv($start: Int, $end: Int, $limit: Int, $scrollId: String) {
        conversionReport(purchaseTimeStart: $start, purchaseTimeEnd: $end, limit: $limit, scrollId: $scrollId) {
          nodes { ${SHOPEE_CONVERSION_FIELDS} }
          pageInfo { hasNextPage scrollId }
        }
      }
    `;
    const data: any = await fetchShopeeGraphQL(query, { start: startS, end: endS, limit: PAGE_LIMIT, scrollId });
    const report = data?.conversionReport;
    if (!report) throw new Error('Shopee: resposta sem conversionReport (schema mudou?)');
    for (const n of report.nodes ?? []) rows.push(...normalizeShopeeConversionNode(n));
    if (!report.pageInfo?.hasNextPage || !report.pageInfo?.scrollId) return rows;
    scrollId = String(report.pageInfo.scrollId);
  }
  throw new Error(`Shopee: janela ${startS}-${endS} excedeu ${MAX_PAGES_PER_WINDOW} páginas`);
}

/**
 * Busca conversões por data de COMPRA nos últimos `lookbackDays` dias (padrão 7).
 * O status de um pedido muda depois (PENDING -> COMPLETED/CANCELLED), por isso o
 * cron deve repetir uma janela móvel; o upsert por externalId torna isso idempotente.
 * Lança ShopeeApiError em falha; nunca devolve dado parcial em silêncio.
 */
export async function fetchShopeeConversions(lookbackDays = 7, now = new Date()): Promise<NormalizedConversion[]> {
  if (!isShopeeAffiliateConfigured()) {
    throw new Error('Shopee: credenciais ausentes (SHOPEE_AFFILIATE_APP_ID/SECRET); nada foi consultado.');
  }
  const endS = Math.floor(now.getTime() / 1000);
  const startS = endS - Math.max(1, Math.min(lookbackDays, 90)) * DAY_S;
  const all: NormalizedConversion[] = [];
  for (let from = startS; from < endS; from += DAY_S) {
    all.push(...(await fetchWindow(from, Math.min(from + DAY_S, endS))));
  }
  return all;
}
