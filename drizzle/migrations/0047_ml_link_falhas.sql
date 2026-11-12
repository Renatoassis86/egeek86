-- 0047: falhas do gerador de links meli.la (itens que o Mercado Livre recusa ou que não geram resultado). NÃO aplicada.
-- Aditiva e reversível (0047_ml_link_falhas.rollback.sql). A fila GET /api/ingest/ml-links exclui a oferta enquanto a falha vale
-- (reintento por motivo em src/lib/ml-links/fila.ts: nao_elegivel 30 d, sem_resultado 3 d, erro_pagina 1 d; teto de 3 tentativas).
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS ml_link_falhas (
  offer_id uuid PRIMARY KEY REFERENCES affiliate_offers(id) ON DELETE CASCADE,
  motivo text NOT NULL CHECK (motivo IN ('nao_elegivel', 'sem_resultado', 'erro_pagina')),
  tentativas integer NOT NULL DEFAULT 1,
  ultima_tentativa timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ml_link_falhas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE ml_link_falhas FROM anon, authenticated;
