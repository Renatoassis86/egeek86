-- Rollback da 0025. Remove as duas tabelas de observabilidade e a coluna de confirmacao. Nenhuma oferta, cotacao ou
-- produto e afetado (a coluna e so um carimbo auxiliar, NULL ate a flag COLLECTOR_RUNS=1 ser ligada).
-- Desligue COLLECTOR_RUNS antes do rollback: com a flag ligada o codigo tentaria gravar e falharia (erro engolido, coleta intacta).
SET LOCAL lock_timeout = '5s';
DROP INDEX IF EXISTS affiliate_offers_price_confirmed_idx;
ALTER TABLE affiliate_offers DROP COLUMN IF EXISTS last_price_confirmed_at;
DROP TABLE IF EXISTS collector_alert_state;
DROP TABLE IF EXISTS collector_runs;
