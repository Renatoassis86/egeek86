/**
 * Sem preço-alvo, dispara alerta se o preço atual estiver a esse percentual (ou
 * mais) abaixo da MÉDIA ÚNICA do produto (todas as lojas, todo o histórico) e o
 * histórico for elegível (>= 5 cotações e >= 14 dias) — evita notificar por uma
 * variação insignificante ou sem base.
 */
export const PRICE_DROP_AVG_THRESHOLD_PERCENT = 12;

/** Dias sem renotificar o mesmo jogo pro mesmo cliente, mesmo se continuar em queda. */
export const NOTIFY_COOLDOWN_DAYS = 3;
