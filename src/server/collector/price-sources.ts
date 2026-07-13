import 'server-only';

export interface PriceSnapshotResult {
  priceCents: number;
  listPriceCents?: number | null;
  couponCode?: string | null;
  /** ID do vendedor na rede de origem (ex: seller_id do Mercado Livre), se a
   * fonte já traz isso de graça na mesma chamada — evita round-trip extra
   * só pra descobrir quem é o vendedor do buy-box atual. */
  externalSellerId?: string | null;
}

/**
 * Um adapter por loja/rede — a mesma interface, implementação diferente por
 * fonte (API oficial, feed de rede agregadora, scraping como último recurso).
 * O coletor (collect-prices.ts) não sabe nem precisa saber COMO cada fonte
 * busca o dado, só chama fetchSnapshot(externalRef).
 *
 * Retornar `null` significa "sem oferta ativa agora" (fora de estoque,
 * anúncio pausado/removido) — o coletor não grava snapshot nesse caso, só
 * atualiza last_checked_at. Não confundir com lançar erro, que é falha real
 * de consulta (rede, autenticação, resposta inesperada).
 */
export interface PriceSource {
  networkSlug: string;
  fetchSnapshot(externalRef: string): Promise<PriceSnapshotResult | null>;
}

const registry = new Map<string, PriceSource>();

export function registerPriceSource(source: PriceSource): void {
  registry.set(source.networkSlug, source);
}

export function getPriceSource(networkSlug: string): PriceSource | null {
  return registry.get(networkSlug) ?? null;
}
