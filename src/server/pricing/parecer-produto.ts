import 'server-only';
import { getPriceMetricsV2 } from '@/server/pricing/price-metrics-v2';
import { buildParecerProduto, type ParecerProduto } from '@/lib/pricing/parecer-produto';

/**
 * Contrato `ParecerProduto` no servidor (Fase 1 do cartão-pai). SÓ LEITURA: alimentado por `getPriceMetricsV2`
 * (mesmo cache SWR de 60 s, mesma fonte do selo e do gráfico: um jogo, uma média só). Não escreve no banco.
 * A página, que já leu o DTO V2 para o resto do topo, chama `buildParecerProduto` direto (evita leitura repetida);
 * esta função é o ponto de entrada para quem só precisa do parecer (a camada/BI da Fase 3).
 */
export async function getParecerProduto(masterProductId: string): Promise<ParecerProduto> {
  return buildParecerProduto(await getPriceMetricsV2(masterProductId));
}
