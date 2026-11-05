-- Metricas de preco por oferta-dia, estado diario por produto e eventos do menor preco (2026-11-05).
-- Ata: docs/conselho/atas/2026-11-05-graficos-preco-dado-real.md (Execucao fase 1). ADR 0004 (emenda).
-- NAO registrada em meta/_journal.json de proposito (como 0019-0023): aplicar por
--   npx tsx --env-file=.env.local scripts/apply-price-daily.ts --apply
-- ADITIVA: so CREATE TABLE/INDEX IF NOT EXISTS. Nao altera nenhuma tabela existente e nao le nem escreve
-- affiliate_price_snapshots (append-only, intocada). Tabelas DERIVADAS: podem ser recalculadas do zero
-- pelo job refresh-price-daily / scripts/backfill-price-daily.ts a partir dos snapshots reais.
-- Rollback: 0024_price_daily_state.rollback.sql (DROP das tres tabelas; nenhuma oferta/cotacao e tocada).
-- Sem FK de proposito: tabela derivada nao pode travar fusao/arquivamento de master_products nem de ofertas.
-- Dia = dia civil em America/Sao_Paulo.

-- 1) Uma linha por oferta por dia COM cotacao medida (carry-forward NAO e gravado aqui, so medicao real).
--    Guarda todas as ofertas com price_cents > 0; a elegibilidade (quarentena, identidade, porteiro)
--    e aplicada na LEITURA (src/server/pricing/eligibility-sql.ts), nunca na gravacao.
CREATE TABLE IF NOT EXISTS price_daily_offer (
  offer_id           uuid        NOT NULL,
  master_product_id  uuid        NOT NULL,
  day                date        NOT NULL,
  median_cents       bigint      NOT NULL,  -- percentile_disc(0.5) das cotacoes do dia (preco realmente observado)
  last_cents         bigint      NOT NULL,  -- ultima cotacao do dia
  min_cents          bigint      NOT NULL,
  max_cents          bigint      NOT NULL,
  n_collected        integer     NOT NULL,  -- cotacoes brutas no dia (nao entra como peso: cada oferta vale 1)
  last_observed_at   timestamptz NOT NULL,
  computed_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (offer_id, day)
);
CREATE INDEX IF NOT EXISTS price_daily_offer_master_day_idx ON price_daily_offer (master_product_id, day);
CREATE INDEX IF NOT EXISTS price_daily_offer_day_idx ON price_daily_offer (day);

-- 2) Estado do dia por produto. closed=true => congelado (o job nunca reescreve).
CREATE TABLE IF NOT EXISTS price_daily_state (
  master_product_id  uuid        NOT NULL,
  day                date        NOT NULL,
  min_cents          bigint,
  min_offer_id       uuid,
  avg_cents          numeric,               -- M_d: media simples dos precos oferta-dia (cada oferta pesa 1); NULL com n_offers < 3
  median_offer_day_cents numeric,           -- mediana entre os precos oferta-dia do dia (grava mesmo com n < 3)
  max_cents          bigint,
  n_offers           integer     NOT NULL DEFAULT 0,  -- ofertas que entraram na media (frescas e plausiveis)
  n_stores           integer     NOT NULL DEFAULT 0,  -- lojas/vendedores distintos entre elas
  n_quotes           integer     NOT NULL DEFAULT 0,  -- cotacoes brutas medidas no dia nessas ofertas
  fresh_offers       integer     NOT NULL DEFAULT 0,  -- ofertas frescas (cotacao <= 48 h) antes da faixa plausivel
  stale_offers       integer     NOT NULL DEFAULT 0,  -- ofertas ativas no dia (cotacao <= 7 dias) mas paradas ha mais de 48 h
  outlier_offers     integer     NOT NULL DEFAULT 0,  -- ofertas frescas fora da faixa plausivel (35 % a 3x a mediana)
  matched_offers     integer,               -- ofertas presentes no dia anterior E neste (conjunto casado)
  matched_change_pct numeric,               -- variacao das MESMAS ofertas: M_C(t2) / M_C(t1) - 1, em %
  composition_flag   boolean,               -- |efeito composicao| > 50 % de |M_d - M_(d-1)|
  members            jsonb,                 -- {"<offer_id>": preco_cents} das ofertas que entraram no dia (base do casamento e da media do periodo)
  quality            text        NOT NULL,
  computed_at        timestamptz NOT NULL DEFAULT now(),
  closed             boolean     NOT NULL DEFAULT false,
  PRIMARY KEY (master_product_id, day),
  CONSTRAINT price_daily_state_quality_chk CHECK (quality IN ('complete', 'partial', 'gap', 'legacy'))
);
CREATE INDEX IF NOT EXISTS price_daily_state_open_idx ON price_daily_state (day) WHERE NOT closed;
CREATE INDEX IF NOT EXISTS price_daily_state_day_idx ON price_daily_state (day);

-- 3) Eventos: cada mudanca do menor preco elegivel do produto (instante, valor, loja, valor anterior).
CREATE TABLE IF NOT EXISTS price_min_events (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  master_product_id  uuid        NOT NULL,
  at                 timestamptz NOT NULL,
  min_cents          bigint      NOT NULL,
  prev_min_cents     bigint,                -- null no primeiro evento do produto
  offer_id           uuid,
  network_id         uuid,
  seller_id          uuid,
  source             text        NOT NULL,
  quality            text        NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT price_min_events_source_chk CHECK (source IN ('live', 'reconstructed')),
  CONSTRAINT price_min_events_quality_chk CHECK (quality IN ('complete', 'partial'))
);
CREATE UNIQUE INDEX IF NOT EXISTS price_min_events_uq ON price_min_events (master_product_id, at, min_cents, source);
CREATE INDEX IF NOT EXISTS price_min_events_master_at_idx ON price_min_events (master_product_id, at DESC);

-- 4) Mesmo padrao de seguranca da 0019/0022: RLS ligado e sem acesso para anon/authenticated.
ALTER TABLE price_daily_offer ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_daily_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_min_events  ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE price_daily_offer FROM anon, authenticated;
REVOKE ALL ON TABLE price_daily_state FROM anon, authenticated;
REVOKE ALL ON TABLE price_min_events  FROM anon, authenticated;
REVOKE ALL ON SEQUENCE price_min_events_id_seq FROM anon, authenticated;
