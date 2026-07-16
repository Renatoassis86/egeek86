/**
 * Dispara alerta se o preço atual estiver a esse percentual (ou mais) abaixo
 * da média de 30 dias — evita notificar por uma variação insignificante.
 */
export const PRICE_DROP_AVG_THRESHOLD_PERCENT = 12;

/** Dias sem renotificar o mesmo jogo pro mesmo cliente, mesmo se continuar em queda. */
export const NOTIFY_COOLDOWN_DAYS = 3;
