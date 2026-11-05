-- Rollback da 0024. Remove so as tres tabelas DERIVADAS; nenhuma oferta, cotacao ou produto e afetado.
-- Elas sao recalculaveis dos snapshots reais (scripts/backfill-price-daily.ts).
DROP TABLE IF EXISTS price_min_events;
DROP TABLE IF EXISTS price_daily_state;
DROP TABLE IF EXISTS price_daily_offer;
