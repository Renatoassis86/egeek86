import 'server-only';
import { registerPriceSource, type PriceSource, type PriceSnapshotResult } from '../price-sources';
import { fetchShopeeGraphQL, isShopeeAffiliateConfigured } from './shopee-auth';

/**
 * Coleta oficial Shopee (Affiliate Open API, GraphQL, productOfferV2).
 *
 * Campos usados (schema ProductOfferV2 conforme documentação do Open API;
 * `price` NÃO existe nesse tipo, só priceMin/priceMax como String):
 * itemId, shopId, shopName, productName, priceMin, priceMax, sales,
 * imageUrl, productLink, offerLink, ratingStar, priceDiscountRate.
 *
 * Limitações reais da API (sem inventar campo):
 * - Não há campo de estoque/disponibilidade. "Disponível" = a API devolveu o
 *   item com preço válido. Item que não aparece (fora do programa de
 *   afiliados, removido ou sem estoque) volta com nodes vazio: tratado como
 *   INDISPONÍVEL, nunca como erro.
 * - priceMin/priceMax são o intervalo entre variações. DIRETRIZ DO DONO (2026-11-12): "em nenhuma loja recusar item por variação de
 *   preço; trazer TODOS os itens para o banco de pesquisa e monitoramento". Então o item com variação ENTRA com o MENOR preço (priceMin,
 *   o preço "a partir de"), marcado com a variação (variantSpread/variantMin/variantMax), sem inventar valor. O que protege a média é
 *   a faixa de plausibilidade (0,35x a 3x a mediana do produto), não a variação. Mensagem ao cliente nunca afirma preço fixo de
 *   variação específica ("a partir de" é o texto honesto); as regras de mensagem não mudam aqui. A origem dos R$ 11,00 da auditoria
 *   (N2) era o priceMin de variação diferente: por isso o preço de variação ampla NUNCA vira "preço de lista" (listPriceCents = null).
 */

export const SHOPEE_PRODUCT_OFFER_FIELDS = `
  itemId
  shopId
  shopName
  productName
  priceMin
  priceMax
  sales
  imageUrl
  productLink
  offerLink
  ratingStar
  priceDiscountRate
`;

/** priceMax/priceMin acima disso = variações de preço muito diferentes: o item entra com o menor preço, MARCADO como variação ampla (não descarta mais). */
export const SHOPEE_MAX_VARIANT_SPREAD = 1.1;

export interface ShopeeOfferNode {
  itemId: string;
  shopId: string | null;
  shopName: string | null;
  productName: string;
  priceCents: number;
  listPriceCents: number | null;
  sales: number | null;
  imageUrl: string | null;
  productLink: string | null;
  offerLink: string | null;
  /** Menor e maior preço entre as variações (centavos) quando a API devolveu faixa (max > min); null = preço único. */
  variantMinCents: number | null;
  variantMaxCents: number | null;
  /** priceMax / priceMin (>= 1); null = preço único. */
  variantSpread: number | null;
  /** true quando priceMax/priceMin > SHOPEE_MAX_VARIANT_SPREAD: o preço do item é "a partir de" (menor variação). */
  variantAmbigua: boolean;
}

/** `ambiguous_price` deixou de existir como rejeição (2026-11-12): variação ampla entra com o menor preço. */
export type ShopeeNodeRejection = 'no_price' | 'no_name';

/** "129.90" -> 12990. Rejeita vazio, não numérico, zero e negativo. */
export function parseShopeePriceToCents(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  const n = Number(typeof raw === 'string' ? raw.replace(',', '.') : raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

export function parseShopeeNode(n: any): { node: ShopeeOfferNode } | { rejected: ShopeeNodeRejection } {
  if (!n?.productName) return { rejected: 'no_name' };
  const min = parseShopeePriceToCents(n.priceMin);
  const max = parseShopeePriceToCents(n.priceMax) ?? min;
  if (min == null || max == null) return { rejected: 'no_price' };
  const faixa = max > min;
  const ambigua = max > min * SHOPEE_MAX_VARIANT_SPREAD;
  const sales = Number(n.sales);
  return {
    node: {
      itemId: String(n.itemId),
      shopId: n.shopId != null ? String(n.shopId) : null,
      shopName: n.shopName ? String(n.shopName) : null,
      productName: String(n.productName),
      priceCents: min,
      // Faixa estreita: o maior preço segue como "preço de lista" (comportamento anterior). Faixa ampla: o maior preço é de OUTRA variação,
      // nunca um preço "de" para o menor; vira null para não fabricar desconto nem "de R$ X por R$ Y".
      listPriceCents: faixa && !ambigua ? max : null,
      variantMinCents: faixa ? min : null,
      variantMaxCents: faixa ? max : null,
      variantSpread: faixa ? Number((max / min).toFixed(4)) : null,
      variantAmbigua: ambigua,
      sales: Number.isFinite(sales) ? sales : null,
      imageUrl: n.imageUrl || null,
      productLink: n.productLink || null,
      offerLink: n.offerLink || null,
    },
  };
}

const DIGITS = /^\d{1,19}$/;

export interface ProductOfferQuery {
  keyword?: string;
  itemId?: string;
  shopId?: string;
  productCatId?: string;
  /** 1 relevância, 2 vendas, 3 preço desc, 4 preço asc, 5 comissão desc. */
  sortType?: 1 | 2 | 3 | 4 | 5;
  page?: number;
  /** Teto real confirmado pela API: 50. */
  limit?: number;
  /** Campos pedidos (padrão SHOPEE_PRODUCT_OFFER_FIELDS). Na BUSCA por palavra-chave a API devolve System Error [10000] com priceDiscountRate (medido em 2026-11-11). */
  fields?: string;
}

/**
 * Executa productOfferV2 e devolve os nós BRUTOS + hasNextPage. Lança
 * ShopeeApiError em falha de API; lista vazia é resposta válida.
 * Ids são inseridos como literais numéricos depois de validados como dígitos
 * (tipo Int64 do schema; evita declarar o tipo da variável).
 */
export async function queryProductOffers(q: ProductOfferQuery): Promise<{ nodes: any[]; hasNextPage: boolean }> {
  const args: string[] = ['keyword: $keyword', 'page: $page', 'limit: $limit'];
  for (const [name, value] of [
    ['itemId', q.itemId],
    ['shopId', q.shopId],
    ['productCatId', q.productCatId],
  ] as const) {
    if (value == null) continue;
    if (!DIGITS.test(value)) throw new Error(`Shopee: ${name} inválido`);
    args.push(`${name}: ${value}`);
  }
  if (q.sortType) args.push(`sortType: ${q.sortType}`);

  const query = `
    query ProductOffer($keyword: String, $page: Int, $limit: Int) {
      productOfferV2(${args.join(', ')}) {
        nodes { ${q.fields ?? SHOPEE_PRODUCT_OFFER_FIELDS} }
        pageInfo { hasNextPage }
      }
    }
  `;
  const data = await fetchShopeeGraphQL<{ productOfferV2?: { nodes?: any[]; pageInfo?: { hasNextPage?: boolean } } }>(query, {
    keyword: q.keyword ?? null,
    page: q.page ?? 1,
    limit: Math.min(q.limit ?? 50, 50),
  });
  if (!data?.productOfferV2) throw new Error('Shopee: resposta sem productOfferV2');
  return {
    nodes: data.productOfferV2.nodes ?? [],
    hasNextPage: Boolean(data.productOfferV2.pageInfo?.hasNextPage),
  };
}

export type ShopeeItemLookup =
  | { status: 'ok'; node: ShopeeOfferNode }
  | { status: 'unavailable'; reason: 'not_returned' | ShopeeNodeRejection };

/**
 * Consulta UM item por itemId. Distingue:
 * - lança ShopeeApiError  => FALHA (auth, rate limit, rede...): não é "indisponível";
 * - { status: 'unavailable' } => a API respondeu e o item não tem preço válido;
 * - { status: 'ok' } => preço válido.
 */
export async function lookupShopeeItem(itemId: string): Promise<ShopeeItemLookup> {
  const { nodes } = await queryProductOffers({ itemId, limit: 5 });
  // Defesa: só vale o nó cujo itemId é exatamente o pedido (a API não pode
  // nos entregar o preço de outro item por filtro ignorado).
  const match = nodes.find((n) => String(n?.itemId) === itemId);
  if (!match) return { status: 'unavailable', reason: 'not_returned' };
  const parsed = parseShopeeNode(match);
  if ('rejected' in parsed) return { status: 'unavailable', reason: parsed.rejected };
  return { status: 'ok', node: parsed.node };
}

/** external_ref das ofertas Shopee é `shopee-<itemId>`. */
export function shopeeItemIdFromRef(externalRef: string): string | null {
  const m = /^shopee-(\d{1,19})$/.exec(externalRef);
  return m ? m[1] : null;
}

export function shopeePublicUrl(node: Pick<ShopeeOfferNode, 'itemId' | 'shopId' | 'productLink'>): string {
  if (node.productLink && /^https:\/\/([a-z0-9-]+\.)?shopee\.com\.br\//i.test(node.productLink)) return node.productLink;
  return node.shopId ? `https://shopee.com.br/product/${node.shopId}/${node.itemId}` : `https://shopee.com.br/product/${node.itemId}`;
}

/**
 * Adapter do registry. A gravação (snapshot, reativação, link, expiração)
 * é feita por collect-shopee-prices.ts, não pelo collect-prices.ts genérico
 * (que pressupõe vendedores do Mercado Livre): `dedicatedCollector`.
 * `operational` depende só da existência das credenciais.
 */
const shopeeSource: PriceSource = {
  networkSlug: 'shopee',
  dedicatedCollector: true,
  get operational() {
    return isShopeeAffiliateConfigured();
  },
  async fetchSnapshots(externalRef: string): Promise<PriceSnapshotResult[]> {
    const itemId = shopeeItemIdFromRef(externalRef);
    if (!itemId) throw new Error(`Shopee: external_ref inválido (${externalRef})`);
    const lookup = await lookupShopeeItem(itemId);
    if (lookup.status !== 'ok') return [];
    return [
      {
        priceCents: lookup.node.priceCents,
        listPriceCents: lookup.node.listPriceCents,
        externalSellerId: lookup.node.shopId ?? 'unknown',
        externalItemId: lookup.node.itemId,
      },
    ];
  },
};

registerPriceSource(shopeeSource);

export { shopeeSource };
