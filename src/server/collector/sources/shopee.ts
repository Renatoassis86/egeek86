import 'server-only';
import { registerPriceSource, type PriceSource, type PriceSnapshotResult } from '../price-sources';

/**
 * Stub honesto: lança erro em vez de simular preço. Falta credenciar a
 * Shopee Affiliate API (GraphQL, via affiliateshopee.com.br), que exige
 * App ID/Secret aprovados pela Shopee (processo de até 2 semanas).
 * `externalRef` esperado (quando implementado): itemId da Shopee.
 */
const shopeeSource: PriceSource = {
  networkSlug: 'shopee',
  async fetchSnapshots(): Promise<PriceSnapshotResult[]> {
    throw new Error(
      'Shopee: coleta ainda não configurada. Falta credenciar a Shopee Affiliate API (SHOPEE_AFFILIATE_APP_ID, SHOPEE_AFFILIATE_APP_SECRET). Aguardando credenciais.'
    );
  },
};

registerPriceSource(shopeeSource);

export { shopeeSource };
