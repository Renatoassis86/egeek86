import 'server-only';
import { registerPriceSource, type PriceSource, type PriceSnapshotResult } from '../price-sources';
import { getValidAccessToken } from './mercado-livre-auth';

interface RawMeliItem {
  item_id: string;
  price: number;
  original_price: number | null;
  seller_id: number;
  condition: string | null;
}

/**
 * Títulos originais dos anúncios dos vendedores, pela API OFICIAL de itens
 * (multiget `/items?ids=...&attributes=id,title`, até 20 ids por chamada). Falha aqui
 * NUNCA derruba a coleta de preço: sem título, a oferta só não passa pela rechecagem
 * de identidade nesse ciclo.
 */
async function fetchSellerTitles(itemIds: string[], accessToken: string): Promise<Map<string, string>> {
  const titles = new Map<string, string>();
  for (let i = 0; i < itemIds.length; i += 20) {
    const chunk = itemIds.slice(i, i + 20);
    try {
      const res = await fetch(`https://api.mercadolibre.com/items?ids=${chunk.join(',')}&attributes=id,title`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) continue;
      const data = (await res.json()) as Array<{ code?: number; body?: { id?: string; title?: string } }>;
      for (const row of data) {
        if (row.code === 200 && row.body?.id && row.body.title) titles.set(row.body.id, row.body.title);
      }
    } catch {
      // sem título neste lote: segue sem rechecagem
    }
  }
  return titles;
}

/**
 * Coletor do Mercado Livre: usa SOMENTE a API oficial de Catálogo
 * (`/products/{catalog_id}/items`). A busca aberta `/sites/MLB/search` foi
 * removida (2026-10-31): responde 403 sempre, dobrava as chamadas por produto.
 *
 * Retorna um resultado por vendedor ativo — collect-prices.ts é quem grava
 * os snapshots de cada loja no banco de dados.
 */
const mercadoLivreSource: PriceSource = {
  networkSlug: 'mercado-livre',
  async fetchSnapshots(externalRef: string): Promise<PriceSnapshotResult[]> {
    const accessToken = await getValidAccessToken();
    const itemsMap = new Map<string, PriceSnapshotResult>();
    // Falha de API (403/5xx/rede) NÃO é "item sem vendedor": sem isso, um
    // bloqueio da API zerava os resultados e collect-prices expirava ofertas
    // vivas por engano (consecutive_miss_count). Ver throw no fim da função.
    const apiFailures: string[] = [];

    // Busca vendedores do Catálogo Buy-Box oficial (/products/{catalog_product_id}/items)
    try {
      const catalogRes = await fetch(`https://api.mercadolibre.com/products/${externalRef}/items`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (catalogRes.ok) {
        const data = (await catalogRes.json()) as { results: RawMeliItem[] };
        for (const r of data.results || []) {
          if (r.seller_id != null && r.item_id != null && r.condition === 'new') {
            itemsMap.set(r.item_id, {
              priceCents: Math.round(r.price * 100),
              listPriceCents: r.original_price != null ? Math.round(r.original_price * 100) : null,
              externalSellerId: String(r.seller_id),
              externalItemId: r.item_id,
            });
          }
        }
      } else if (catalogRes.status !== 404) {
        apiFailures.push(`/products/{id}/items HTTP ${catalogRes.status}`);
      }
    } catch (err) {
      apiFailures.push(`/products/{id}/items rede: ${(err as Error).message}`);
    }

    if (itemsMap.size === 0 && apiFailures.length > 0) {
      // Resultado vazio + API falhando = desconhecido, não "sem vendedor".
      throw new Error(`Mercado Livre API indisponível pra ${externalRef}: ${apiFailures.join('; ')}`);
    }

    // Rechecagem de identidade: título original de cada anúncio (best effort, API oficial).
    if (itemsMap.size > 0) {
      const titles = await fetchSellerTitles(Array.from(itemsMap.keys()), accessToken);
      for (const [itemId, snap] of itemsMap) snap.sellerTitle = titles.get(itemId) ?? null;
    }

    return Array.from(itemsMap.values());
  },
};

registerPriceSource(mercadoLivreSource);

export { mercadoLivreSource };
