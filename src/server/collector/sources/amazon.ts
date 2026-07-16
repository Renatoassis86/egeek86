import 'server-only';
import { registerPriceSource, type PriceSource, type PriceSnapshotResult } from '../price-sources';

/**
 * Stub honesto: lança erro em vez de simular preço. Falta credenciar a
 * Amazon PA-API 5.0 (Product Advertising API), que exige conta de
 * Associados aprovada com vendas qualificadas nos últimos 30 dias.
 * `externalRef` esperado (quando implementado): ASIN.
 */
const amazonSource: PriceSource = {
  networkSlug: 'amazon',
  async fetchSnapshot(): Promise<PriceSnapshotResult | null> {
    throw new Error(
      'Amazon: coleta ainda não configurada. Falta credenciar a Amazon PA-API 5.0 (AMAZON_PA_API_ACCESS_KEY, AMAZON_PA_API_SECRET_KEY, AMAZON_PA_API_PARTNER_TAG). Aguardando credenciais.'
    );
  },
};

registerPriceSource(amazonSource);

export { amazonSource };
