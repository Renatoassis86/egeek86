-- Rollback da 0045: remove indice e colunas. Nenhuma oferta/cotacao e tocada; so some o sinal de demanda (volta ao proxy sem sold_quantity).
-- Se src/server/queries/master-vendas.ts ja estiver em uso, desligue o chamador antes (a consulta le a coluna).
SET LOCAL lock_timeout = '5s';
DROP INDEX IF EXISTS affiliate_offers_sold_quantity_idx;
ALTER TABLE affiliate_offers DROP COLUMN IF EXISTS sold_quantity_at;
ALTER TABLE affiliate_offers DROP COLUMN IF EXISTS sold_quantity;
