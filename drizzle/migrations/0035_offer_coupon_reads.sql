-- 0035: leituras de cupom POR ANÚNCIO (preço com cupom exibido na página do item do Mercado Livre).
-- Aditiva e reversível (0035_offer_coupon_reads.rollback.sql). Lida pela aba logada do dono; o servidor só guarda e consulta.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE IF NOT EXISTS offer_coupon_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES affiliate_offers(id) ON DELETE CASCADE,
  campaign_id text,
  status text,
  label text,
  price_with_coupon_cents integer,
  price_seen_cents integer,
  source text NOT NULL DEFAULT 'item_page_assistida',
  read_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS offer_coupon_reads_offer_idx ON offer_coupon_reads (offer_id, read_at DESC);

ALTER TABLE offer_coupon_reads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE offer_coupon_reads FROM anon, authenticated;
