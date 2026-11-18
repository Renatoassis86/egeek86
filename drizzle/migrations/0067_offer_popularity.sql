-- 0067: popularidade por produto da rede (R-103; dono 2026-11-18). Tabela NOVA, so adiciona; nada existente e alterado.
-- Fonte inicial: 'ml_highlights' (20 mais vendidos por categoria do ML). score 0..1 DENTRO da fonte (1 = 1o lugar); nunca comparar entre fontes/redes.
SET LOCAL lock_timeout = '5s';
CREATE TABLE IF NOT EXISTS offer_popularity (
  network_id   uuid        NOT NULL REFERENCES affiliate_networks(id),
  external_ref text        NOT NULL,
  source       text        NOT NULL,
  category_id  text,
  rank         integer     NOT NULL CHECK (rank >= 1),
  list_size    integer     NOT NULL CHECK (list_size >= 1),
  score        numeric(5,4) NOT NULL CHECK (score >= 0 AND score <= 1),
  observed_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (network_id, external_ref, source)
);
CREATE INDEX IF NOT EXISTS offer_popularity_observed_idx ON offer_popularity (observed_at DESC);
ALTER TABLE offer_popularity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE offer_popularity FROM anon, authenticated;
