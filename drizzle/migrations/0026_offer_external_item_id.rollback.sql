-- Rollback da 0026. Remove o indice e a coluna. Nenhuma oferta, cotacao ou produto e afetado.
-- Desligue qualquer flag que grave external_item_id antes (o codigo tentaria gravar e falharia).
SET LOCAL lock_timeout = '5s';
DROP INDEX IF EXISTS affiliate_offers_network_item_uq;
ALTER TABLE affiliate_offers DROP COLUMN IF EXISTS external_item_id;
