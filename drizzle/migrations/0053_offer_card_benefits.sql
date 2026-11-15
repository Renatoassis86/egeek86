-- 0053: DESCONTO POR CARTAO / MEIO DE PAGAMENTO lido na pagina do anuncio (dono, 2026-11-15, #112).
-- ADITIVA (tabela nova), fora do journal do Drizzle (molde 0044-0052). Aplicada por scripts/aplicar-migration-0053.ts (dry-run, retrato do esquema antes, --rollback).
-- Uma linha por (oferta, beneficio); a releitura so atualiza last_seen_at. alerted_at = aviso privado do dono ja enviado (1 aviso por beneficio novo).
-- Rollback: 0053_offer_card_benefits.rollback.sql.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE IF NOT EXISTS offer_card_benefits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES affiliate_offers(id) ON DELETE CASCADE,
  dedup_key text NOT NULL,
  kind text NOT NULL,
  issuer text,
  pct numeric(5,2),
  cap_cents integer,
  min_order_cents integer,
  installments integer,
  installment_cents integer,
  no_interest boolean NOT NULL DEFAULT false,
  cashback_cents integer,
  base_price_cents integer,
  final_price_cents integer,
  needs_confirm boolean NOT NULL DEFAULT false,
  raw_text text NOT NULL,
  source text NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  alerted_at timestamptz,
  UNIQUE (offer_id, dedup_key)
);
CREATE INDEX IF NOT EXISTS offer_card_benefits_seen_idx ON offer_card_benefits (last_seen_at DESC);

ALTER TABLE offer_card_benefits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE offer_card_benefits FROM anon, authenticated;
