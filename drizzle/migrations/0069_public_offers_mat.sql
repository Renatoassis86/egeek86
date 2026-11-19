-- 0069: ofertas publicas materializadas (alivio de I/O da plataforma; dono 2026-11-19). SO ADICIONA: duas tabelas novas, nada existente e alterado.
-- public_offers_mat = o resultado da CTE `public_offers` (src/server/queries/public-offers.ts), recalculado de forma incremental por cron curto
-- (src/server/jobs/public-offers-mat.ts). Derivada e recriavel: apagar a tabela so devolve a leitura a CTE (flag PUBLIC_OFFERS_MAT=off).
SET LOCAL lock_timeout = '5s';
CREATE TABLE IF NOT EXISTS public_offers_mat (
  id                  uuid        PRIMARY KEY,
  vertical            text        NOT NULL,
  master_product_id   uuid        NOT NULL,
  current_price_cents bigint      NOT NULL,
  avg_excluded        boolean     NOT NULL DEFAULT false,
  refreshed_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS public_offers_mat_vertical_master_idx ON public_offers_mat (vertical, master_product_id);
-- Controle: 'wm' = marca d'agua global (ts) e ultima rodada ok (ran_at); 'full:<vertical>' = ultima reconciliacao completa da vertical.
CREATE TABLE IF NOT EXISTS public_offers_mat_meta (
  key    text        PRIMARY KEY,
  ts     timestamptz NOT NULL,
  ran_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public_offers_mat ENABLE ROW LEVEL SECURITY;
ALTER TABLE public_offers_mat_meta ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public_offers_mat FROM anon, authenticated;
REVOKE ALL ON TABLE public_offers_mat_meta FROM anon, authenticated;
