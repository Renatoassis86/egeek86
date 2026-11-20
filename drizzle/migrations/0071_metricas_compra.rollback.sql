-- Rollback da 0071: remove as colunas de metricas de compra (os dados sao so de leitura recente; nada de preco/media depende delas).
ALTER TABLE affiliate_offers DROP COLUMN IF EXISTS installments_qty;
ALTER TABLE affiliate_offers DROP COLUMN IF EXISTS installment_cents;
ALTER TABLE affiliate_offers DROP COLUMN IF EXISTS installments_no_interest;
ALTER TABLE affiliate_offers DROP COLUMN IF EXISTS installments_seen_at;
ALTER TABLE affiliate_offers DROP COLUMN IF EXISTS free_shipping;
ALTER TABLE affiliate_offers DROP COLUMN IF EXISTS shipping_seen_at;
