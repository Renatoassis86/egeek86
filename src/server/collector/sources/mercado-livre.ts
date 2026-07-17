import 'server-only';
import { registerPriceSource, type PriceSource, type PriceSnapshotResult } from '../price-sources';
import { getValidAccessToken } from './mercado-livre-auth';

/**
 * `externalRef` esperado aqui é o catalog_product_id do Mercado Livre (ex:
 * "MLB50196682"), NÃO o item_id de um seller específico — descoberta ao
 * testar ao vivo em 2026-07-13 (ver docs/mercado-livre-api.md):
 * - GET /items/{item_id} direto retorna 403 pra itens de terceiros (só
 *   funciona pro dono do item).
 * - GET /products/{catalog_product_id}/items É o endpoint certo — feito
 *   justamente pra comparação de preço entre vendedores do mesmo produto,
 *   liberado pra qualquer app autenticado, e já retorna TODOS os vendedores
 *   ativos daquele produto numa única chamada (não só o buy box).
 *
 * Retorna um resultado por vendedor — collect-prices.ts é quem decide o que
 * fazer com cada um (criar/atualizar a oferta correspondente). Aqui não se
 * decide "qual é o melhor preço", só se reporta o que a API devolveu.
 */
const mercadoLivreSource: PriceSource = {
  networkSlug: 'mercado-livre',
  async fetchSnapshots(externalRef: string): Promise<PriceSnapshotResult[]> {
    const accessToken = await getValidAccessToken();

    const response = await fetch(`https://api.mercadolibre.com/products/${externalRef}/items`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (response.status === 404) {
      return []; // "No winners found" — sem oferta ativa pra esse produto agora.
    }
    if (!response.ok) {
      throw new Error(`Mercado Livre: falha ao consultar ${externalRef} (${response.status}): ${await response.text()}`);
    }

    const data = (await response.json()) as {
      results: { item_id: string; price: number; original_price: number | null; seller_id: number }[];
    };

    return data.results
      .filter((r) => r.seller_id != null && r.item_id != null)
      .map((r) => ({
        priceCents: Math.round(r.price * 100),
        listPriceCents: r.original_price != null ? Math.round(r.original_price * 100) : null,
        externalSellerId: String(r.seller_id),
        externalItemId: r.item_id,
      }));
  },
};

registerPriceSource(mercadoLivreSource);

export { mercadoLivreSource };
