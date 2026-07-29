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
 * Coletor do Mercado Livre: combina os vendedores da Buy-Box oficial de Catálogo
 * (`/products/{catalog_id}/items`) com anúncios concorrentes avulsos do
 * marketplace (`/sites/MLB/search?catalog_product_id={catalog_id}`).
 *
 * Retorna um resultado por vendedor ativo — collect-prices.ts é quem grava
 * os snapshots de cada loja no banco de dados.
 */
const mercadoLivreSource: PriceSource = {
  networkSlug: 'mercado-livre',
  async fetchSnapshots(externalRef: string): Promise<PriceSnapshotResult[]> {
    const accessToken = await getValidAccessToken();
    const itemsMap = new Map<string, PriceSnapshotResult>();

    // 1. Busca vendedores do Catálogo Buy-Box oficial (/products/{catalog_product_id}/items)
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
      }
    } catch {
      // Falha no catálogo não impede tentar a busca aberta abaixo
    }

    // 2. Busca anúncios concorrentes no Marketplace por catalog_product_id (/sites/MLB/search)
    try {
      const searchRes = await fetch(
        `https://api.mercadolibre.com/sites/MLB/search?catalog_product_id=${encodeURIComponent(externalRef)}&limit=50`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (searchRes.ok) {
        const searchData = (await searchRes.json()) as {
          results: {
            id: string;
            price: number;
            original_price?: number | null;
            seller?: { id: number };
            condition?: string | null;
          }[];
        };

        for (const item of searchData.results || []) {
          const sellerId = item.seller?.id;
          const condition = item.condition ?? 'new';

          if (sellerId != null && item.id != null && condition === 'new') {
            if (!itemsMap.has(item.id)) {
              itemsMap.set(item.id, {
                priceCents: Math.round(item.price * 100),
                listPriceCents: item.original_price != null ? Math.round(item.original_price * 100) : null,
                externalSellerId: String(sellerId),
                externalItemId: item.id,
              });
            }
          }
        }
      } else if (searchRes.status !== 404) {
        // Achado real (2026-07-29): /sites/MLB/search passou a devolver 403
        // "forbidden" pra QUALQUER busca (com ou sem token) — bloqueio da
        // própria API do Mercado Livre nesse endpoint, não erro pontual de
        // item. Antes esse catch/else engolia isso 100% em silêncio; logar
        // aqui é o que teria dado visibilidade do problema há mais tempo.
        console.error(`[mercado-livre] /sites/MLB/search falhou (${searchRes.status}) pra catalog_product_id=${externalRef}`);
      }
    } catch (err) {
      console.error(`[mercado-livre] erro de rede em /sites/MLB/search pra ${externalRef}:`, (err as Error).message);
    }

    return Array.from(itemsMap.values());
  },
};

registerPriceSource(mercadoLivreSource);

export { mercadoLivreSource };
