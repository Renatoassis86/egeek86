-- 0056 (#119): auditoria dos links das ofertas (o que a página do link mostra x o que a oferta diz). ADITIVA e idempotente: tabela nova; nenhuma oferta é tocada.
-- Rollback: 0056_offer_link_audit.rollback.sql.
CREATE TABLE IF NOT EXISTS offer_link_audit (
  id bigserial PRIMARY KEY,
  offer_id uuid NOT NULL REFERENCES affiliate_offers(id) ON DELETE CASCADE,
  checked_at timestamptz NOT NULL DEFAULT now(),
  link text,
  item_id_link text,
  product_id_link text,
  price_link_cents integer,
  status_link text,
  seller_link text,
  offer_price_cents integer,
  diff_pct numeric(8,2),
  verdict text NOT NULL,
  note text
);
CREATE INDEX IF NOT EXISTS offer_link_audit_offer_idx ON offer_link_audit (offer_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS offer_link_audit_verdict_idx ON offer_link_audit (verdict, checked_at DESC);
