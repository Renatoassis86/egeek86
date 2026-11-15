-- 0054: frete e prazo por oferta e CEP (#118). ADITIVA, idempotente: tabela nova; nenhuma oferta e tocada.
CREATE TABLE IF NOT EXISTS offer_shipping_quotes (
  offer_id uuid NOT NULL REFERENCES affiliate_offers(id) ON DELETE CASCADE,
  zip text NOT NULL,
  cost_cents integer,
  free boolean NOT NULL DEFAULT false,
  eta_from date,
  eta_to date,
  eta_days_min integer,
  eta_days_max integer,
  carrier text,
  logistic text,
  sold_by text,
  item_id text,
  source text NOT NULL CHECK (source IN ('ml_api', 'amazon_pagina')),
  raw_text text,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (offer_id, zip)
);
CREATE INDEX IF NOT EXISTS offer_shipping_quotes_read_at_idx ON offer_shipping_quotes (read_at);
