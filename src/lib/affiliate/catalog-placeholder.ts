/**
 * Seleção do "placeholder de catálogo" (oferta sem vendedor, criada por discover-products.ts) que recebe o
 * melhor preço de um grupo de coleta. Função pura, sem banco (testável em scripts/test-catalog-placeholder.ts).
 *
 * Incidente 2026-11-05 (Mario vs. Donkey Kong, master 85da0979…): um master com 3 catálogos ML ativos tem
 * 1 placeholder (external_ref de UM catálogo). O lookup antigo era por master+rede+seller nulo, SEM external_ref;
 * então os 3 grupos (um por catálogo) gravavam no MESMO placeholder e o preço alternava a cada ciclo.
 *
 * Regra: o placeholder só é do grupo se o external_ref bater com o do catálogo do grupo. O índice único
 * affiliate_offers_network_external_ref_uq (rede + external_ref, seller nulo) garante no máximo 1 candidato por
 * grupo. Sem placeholder próprio => null => NÃO grava preço em placeholder de outro catálogo (e não cria nada:
 * as ofertas por vendedor do grupo já carregam o preço e entram nas médias; criar placeholder novo exigiria
 * passar pela dedup e geraria oferta redundante).
 */
export interface PlaceholderCandidate {
  id: string;
  externalRef: string | null;
}

export function pickCatalogPlaceholder<T extends PlaceholderCandidate>(
  candidates: readonly T[],
  groupExternalRef: string
): T | null {
  if (!groupExternalRef) return null;
  return candidates.find((c) => c.externalRef === groupExternalRef) ?? null;
}
