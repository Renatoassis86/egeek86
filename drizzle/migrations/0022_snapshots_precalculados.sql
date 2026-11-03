-- Fase 2 da performance (2026-11-03): pre-calculo persistido da vitrine.
-- Ata: docs/conselho/atas/2026-11-03-fase2-precalculo.md
-- NAO registrada em meta/_journal.json de proposito (como 0019-0021): aplicar por
--   npx tsx --env-file=.env.local scripts/apply-precalculo-snapshots.ts --apply
-- ADITIVA: so CREATE TABLE/INDEX IF NOT EXISTS. Nao toca em nenhuma tabela existente.
-- Rollback: 0022_snapshots_precalculados.rollback.sql (DROP das duas tabelas; sao DERIVADAS,
-- recalculadas pelo cron /api/cron/refresh-snapshots; nenhuma oferta/cotacao e tocada).
-- Sem FK de proposito: tabela derivada nao pode travar fusao/arquivamento de master_products.

-- 1) Estatistica canonica por produto (mesma CTE `product_stats` de statsAggCtes + o objeto
--    MasterProductPriceStats completo em `payload`). Uma linha por master_product com cotacao plausivel.
CREATE TABLE IF NOT EXISTS product_price_stats (
  master_product_id uuid PRIMARY KEY,
  quote_count       integer       NOT NULL,
  avg_quote_count   integer,
  avg_cents         numeric,
  raw_avg_cents     numeric,
  max_cents         bigint,
  max_raw_cents     bigint,
  history_since     timestamptz,
  history_until     timestamptz,
  history_days      integer,
  min_all           bigint,
  min_1y            bigint,
  min_3m            bigint,
  median_cents      numeric,
  dispersion_ratio  numeric,
  n_all             integer,
  raw_min           bigint,
  floor_cents       numeric,
  pf_median         numeric,
  payload           jsonb         NOT NULL,
  computed_at       timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS product_price_stats_computed_at_idx ON product_price_stats (computed_at);

-- 2) Blocos prontos da vitrine (chave -> JSON): contadores publicos, ranking de ofertas por filtro, etc.
CREATE TABLE IF NOT EXISTS showcase_snapshot (
  key         text PRIMARY KEY,
  payload     jsonb       NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS showcase_snapshot_computed_at_idx ON showcase_snapshot (computed_at);

-- 3) Mesmo padrao de seguranca da 0019: RLS ligado e sem acesso para anon/authenticated.
ALTER TABLE product_price_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE showcase_snapshot   ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE product_price_stats FROM anon, authenticated;
REVOKE ALL ON TABLE showcase_snapshot   FROM anon, authenticated;
