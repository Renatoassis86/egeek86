import 'server-only';

export interface PriceSnapshotResult {
  priceCents: number;
  listPriceCents?: number | null;
  couponCode?: string | null;
  /** ID do vendedor na rede de origem (ex: seller_id do Mercado Livre) — cada
   * resultado é sempre de UM vendedor específico, nunca um agregado. */
  externalSellerId: string;
  /** ID do anúncio/listing específico desse vendedor na rede (ex: item_id do
   * Mercado Livre) — usado como referência ao criar a oferta desse vendedor. */
  externalItemId: string;
  /**
   * Título ORIGINAL do anúncio do vendedor (ex.: Mercado Livre, multiget oficial
   * /items). O catálogo do ML agrupa anúncios sob um catalog_product_id, mas o
   * título de cada vendedor pode dizer "Open Box", "PS4/PS5", "1TB" etc. Usado só
   * para a rechecagem de identidade da oferta (offer-identity.ts); ausente = sem rechecagem.
   */
  sellerTitle?: string | null;
}

/**
 * Um adapter por loja/rede — a mesma interface, implementação diferente por
 * fonte (API oficial, feed de rede agregadora, scraping como último recurso).
 * O coletor (collect-prices.ts) não sabe nem precisa saber COMO cada fonte
 * busca o dado, só chama fetchSnapshots(externalRef).
 *
 * Retorna UM resultado por vendedor ativo encontrado pra aquele produto —
 * array vazio significa "sem oferta ativa agora" (fora de estoque, anúncio
 * pausado/removido) — o coletor não grava snapshot nesse caso, só atualiza
 * last_checked_at. Não confundir com lançar erro, que é falha real de
 * consulta (rede, autenticação, resposta inesperada). Mesmo quando a rede só
 * tem 1 vendedor pra aquele produto, o retorno ainda é um array de 1 item —
 * evita ramificação especial pra "produto com 1 vendedor" vs "com vários".
 */
export interface PriceSource {
  networkSlug: string;
  /**
   * false = stub sem coleta oficial implementada (só lança erro). O coletor
   * não seleciona ofertas dessas redes: tentar e falhar a cada tick só
   * ocuparia a fila de 150 ofertas por execução (EG-03). Default: true.
   */
  operational?: boolean;
  /**
   * true = a rede tem coletor próprio (ex.: collect-shopee-prices.ts) e NÃO
   * deve passar pelo collect-prices.ts genérico, que pressupõe vários
   * vendedores por external_ref (modelo do Mercado Livre).
   */
  dedicatedCollector?: boolean;
  fetchSnapshots(externalRef: string): Promise<PriceSnapshotResult[]>;
}

const registry = new Map<string, PriceSource>();

export function registerPriceSource(source: PriceSource): void {
  registry.set(source.networkSlug, source);
}

export function getPriceSource(networkSlug: string): PriceSource | null {
  return registry.get(networkSlug) ?? null;
}

/** Slugs de rede com coleta operacional pelo coletor genérico (exclui redes com coletor dedicado). */
export function listOperationalSourceSlugs(): string[] {
  return Array.from(registry.values())
    .filter((s) => s.operational !== false && !s.dedicatedCollector)
    .map((s) => s.networkSlug);
}
