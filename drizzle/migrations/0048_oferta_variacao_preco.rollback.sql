-- Rollback da 0047: remove as tres colunas de variacao. Nenhuma oferta/cotacao e tocada; desligue SHOPEE_VARIANTE_COLUNAS antes.
SET LOCAL lock_timeout = '5s';
ALTER TABLE affiliate_offers DROP COLUMN IF EXISTS variant_spread;
ALTER TABLE affiliate_offers DROP COLUMN IF EXISTS variant_max_cents;
ALTER TABLE affiliate_offers DROP COLUMN IF EXISTS variant_min_cents;
