// Configuração ÚNICA das métricas de preço V2 (fase 2 do plano de 2026-11-05). Sem server-only: pura.

/**
 * FLAG de leitura V2 do topo da página de produto e do novo selo.
 * Desligada por padrão. Para LIGAR: variável de ambiente `PRICE_METRICS_V2=1` (Vercel > Environment Variables
 * ou `.env.local`) e novo deploy/reinício. Para DESLIGAR: remover a variável ou colocar qualquer valor diferente de "1".
 * Desligada (ou com falha na leitura V2), a página mostra EXATAMENTE o comportamento anterior.
 * Depende das tabelas sombra alimentadas por `PRICE_DAILY_SHADOW=1` (gancho da coleta + job); sem elas o bloco
 * V2 não tem dado e a página cai no comportamento anterior.
 */
export function isPriceMetricsV2Enabled(): boolean {
  return process.env.PRICE_METRICS_V2 === '1';
}

/**
 * FLAG do cartão-pai "O que sabemos hoje" (Fase 1, ata 2026-11-05), PRÓPRIA e desligada por padrão.
 * Para LIGAR: variável de ambiente `PRODUCT_CARD_V1=1` (junto de `PRICE_METRICS_V2=1`, de onde vêm os dados; sem ela
 * a página não lê o DTO V2 e o cartão não aparece) e novo deploy/reinício. Para DESLIGAR: remover a variável ou usar
 * qualquer valor diferente de "1". Desligada, a página fica IDÊNTICA à anterior. Não liga o juízo (VERDICT_JUDGEMENT_ENABLED).
 */
export function isProductCardV1Enabled(): boolean {
  return process.env.PRODUCT_CARD_V1 === '1';
}

/**
 * PONTO ÚNICO configurável (decisão do dono pendente, 2026-11-05): vendedor fraco (reputação baixa ou poucas
 * vendas, mesma regra de `weakSellerSql`/`sellerTier`) entra no "menor preço de 30d/90d/sempre" e no selo
 * "Menor preço do período"?
 *   false (PADRÃO recomendado) = NÃO entra: o menor preço de referência ignora ofertas de vendedor fraco, e o
 *                                selo não é dado quando quem detém o preço atual é vendedor fraco.
 *   true                       = entra (menor bruto elegível).
 * Isto NÃO muda o "Preço agora": ele sempre mostra o menor preço elegível vigente de verdade.
 */
export const LOWS_INCLUDE_WEAK_SELLER = false;

/**
 * Placeholder redundante (decisão 2026-11-05, ata do plano de métricas): a oferta-placeholder do catálogo do ML
 * (seller_id NULL) NÃO entra nas métricas oferta-dia quando já existe, no mesmo produto e na mesma rede, oferta
 * ATIVA com vendedor (senão o mesmo anúncio conta duas vezes). Se o vendedor sai do ar, o placeholder volta a contar.
 * Medição: docs/medicao-regra-placeholder-2026-11-04.csv (906 produtos; 175 perdem o piso de 3 ofertas).
 * Reverter = false (nenhuma linha de dado é tocada).
 */
export const EXCLUDE_REDUNDANT_PLACEHOLDER = true;

/**
 * SEGUNDO PONTO ÚNICO (decisão D-A do dono, 2026-11-05): rótulo de JUÍZO ("Abaixo do usual / Preço normal / Acima do usual"
 * e o selo "Menor preço do período"). DESLIGADO enquanto não existir backtest contra o baseline "preço <= mínimo de 30 dias".
 * Desligado, o topo mostra só fatos (preço agora, comparação com a mediana das lojas hoje, cobertura). Ligado (mudar para true
 * e novo deploy), o juízo usa a série dos MÍNIMOS DIÁRIOS de 30 dias, independente de PRICE_METRICS_V2.
 */
export const VERDICT_JUDGEMENT_ENABLED = false;

/** Limiar do juízo = max(JUDGEMENT_MIN_BAND_PERCENT, K x dispersão robusta relativa); K configurável (calibrar no backtest). */
export const JUDGEMENT_MIN_BAND_PERCENT = 5;
export const JUDGEMENT_MAD_K = 1;
/** Histerese: para SAIR de "abaixo/acima" o desvio precisa recuar esta fração do limiar (evita o rótulo piscar). */
export const JUDGEMENT_HYSTERESIS_FRACTION = 0.2;
/** Percentil só com pelo menos este número de dias de mínimos; antes, ranking "o menor de N dias". */
export const JUDGEMENT_MIN_DAYS_FOR_PERCENTILE = 10;
/** Exige dias medidos com n >= MIN_STORES_PER_DAY lojas distintas: pelo menos MIN_MEASURED_DAYS dos últimos MEASURED_WINDOW_DAYS. */
export const JUDGEMENT_MEASURED_WINDOW_DAYS = 14;
export const JUDGEMENT_MIN_MEASURED_DAYS = 10;
export const JUDGEMENT_MIN_STORES_PER_DAY = 3;
/** "Menor preço do período": corroboração por 2ª loja a até este percentual do preço, ou por reconfirmação do preço. */
export const CORROBORATION_BAND_PERCENT = 10;
/** Reconfirmação do preço: uma checagem posterior à cotação com pelo menos esta folga (a coleta só grava cotação na mudança). */
export const CORROBORATION_RECHECK_MIN_MS = 30 * 60_000;

/**
 * Limite (em %) acima do qual a comparação "abaixo do valor do meio entre as lojas" é marcada como `percentualExtremo` no contrato
 * `ParecerProduto` (Fase 1/2 do cartão-pai). É SÓ UM SINALIZADOR exposto para decisão do dono: hoje não muda nenhum texto nem esconde nada.
 * Um preço mais de 50% abaixo do meio costuma ser anúncio errado, kit incompleto ou produto diferente; o que fazer com isso é regra de negócio.
 */
export const PARECER_PERCENTUAL_EXTREMO = 50;
