-- 0071 R-107: metricas de decisao de compra por oferta (parcelamento, frete gratis), cada uma com a data da leitura que a provou.
-- Puramente ADITIVA (colunas nulas, sem DEFAULT que reescreva a tabela). pix_cents/pix_visto_em (0062) passam a valer para qualquer rede,
-- so com leitura que PROVE o preco final no Pix (nunca derivado de percentual). Nulo = nao provado = a linha nao aparece na mensagem.
ALTER TABLE affiliate_offers ADD COLUMN IF NOT EXISTS installments_qty smallint;
ALTER TABLE affiliate_offers ADD COLUMN IF NOT EXISTS installment_cents bigint;
ALTER TABLE affiliate_offers ADD COLUMN IF NOT EXISTS installments_no_interest boolean;
ALTER TABLE affiliate_offers ADD COLUMN IF NOT EXISTS installments_seen_at timestamptz;
ALTER TABLE affiliate_offers ADD COLUMN IF NOT EXISTS free_shipping boolean;
ALTER TABLE affiliate_offers ADD COLUMN IF NOT EXISTS shipping_seen_at timestamptz;
