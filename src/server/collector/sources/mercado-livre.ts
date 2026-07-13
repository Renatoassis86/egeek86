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
 *   liberado pra qualquer app autenticado.
 * Efeito prático: rastreamos o "melhor preço atual" daquele produto
 * canônico no Mercado Livre, não necessariamente o preço exato do vendedor
 * que o admin colou no link de afiliado — é o comportamento correto pra uma
 * plataforma de inteligência de preço (se o buy box mudar de vendedor, o
 * preço rastreado deve refletir isso).
 */
const mercadoLivreSource: PriceSource = {
  networkSlug: 'mercado-livre',
  async fetchSnapshot(externalRef: string): Promise<PriceSnapshotResult | null> {
    const accessToken = await getValidAccessToken();

    const response = await fetch(`https://api.mercadolibre.com/products/${externalRef}/items`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (response.status === 404) {
      return null; // "No winners found" — sem oferta ativa pra esse produto agora.
    }
    if (!response.ok) {
      throw new Error(`Mercado Livre: falha ao consultar ${externalRef} (${response.status}): ${await response.text()}`);
    }

    const data = (await response.json()) as {
      results: { price: number; original_price: number | null; seller_id: number }[];
    };
    const winner = data.results[0];
    if (!winner) {
      return null;
    }

    return {
      priceCents: Math.round(winner.price * 100),
      listPriceCents: winner.original_price != null ? Math.round(winner.original_price * 100) : null,
      externalSellerId: winner.seller_id != null ? String(winner.seller_id) : null,
    };
  },
};

registerPriceSource(mercadoLivreSource);

export { mercadoLivreSource };
