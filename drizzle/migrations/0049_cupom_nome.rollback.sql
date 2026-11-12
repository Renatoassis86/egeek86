-- Rollback da 0049: remove as colunas de nome e codigo do cupom. Nenhuma leitura de preco e tocada; desligue CUPOM_NOME_COLUNAS antes.
SET LOCAL lock_timeout = '5s';
ALTER TABLE offer_coupon_reads DROP COLUMN IF EXISTS coupon_code;
ALTER TABLE offer_coupon_reads DROP COLUMN IF EXISTS coupon_name;
