import 'server-only';
import { registerPriceSource, type PriceSource, type PriceSnapshotResult } from '../price-sources';

/**
 * Stub honesto: lança erro em vez de simular preço. Falta credenciar a
 * AliExpress Affiliate API (portals.aliexpress.com/affiportals), que exige
 * App Key/Secret do Portal de Afiliados.
 * `externalRef` esperado (quando implementado): productId da AliExpress.
 */
const aliexpressSource: PriceSource = {
  networkSlug: 'aliexpress',
  async fetchSnapshots(): Promise<PriceSnapshotResult[]> {
    throw new Error(
      'AliExpress: coleta ainda não configurada. Falta credenciar a AliExpress Affiliate API (ALIEXPRESS_APP_KEY, ALIEXPRESS_APP_SECRET). Aguardando credenciais.'
    );
  },
};

registerPriceSource(aliexpressSource);

export { aliexpressSource };
