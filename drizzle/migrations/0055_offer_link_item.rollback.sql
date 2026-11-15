-- Rollback da 0055: remove as colunas (o codigo as le por SQL cru com tolerancia; desligue CONFIRMACAO_PRECO_MENSAGEM antes).
ALTER TABLE affiliate_offers DROP COLUMN IF EXISTS item_trocado_at;
ALTER TABLE affiliate_offers DROP COLUMN IF EXISTS link_item_id;
