-- 0055 (#119): anuncio ao qual o link afiliado da oferta aponta (link_item_id) e quando o anuncio precificado trocou (item_trocado_at).
-- ADITIVA e idempotente: duas colunas anulaveis; nenhuma oferta, preco ou link e alterado. Rollback: 0055_offer_link_item.rollback.sql.
ALTER TABLE affiliate_offers ADD COLUMN IF NOT EXISTS link_item_id text;
ALTER TABLE affiliate_offers ADD COLUMN IF NOT EXISTS item_trocado_at timestamptz;
