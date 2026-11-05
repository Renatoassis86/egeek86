-- Observabilidade do coletor (2026-11-05). PROPOSTA: NAO aplicada, NAO registrada em meta/_journal.json de proposito
-- (como 0019-0024). Aplicar so com aprovacao do dono:
--   npx tsx --env-file=.env.local scripts/apply-collector-runs.ts            # dry-run
--   npx tsx --env-file=.env.local scripts/apply-collector-runs.ts --apply
-- Ata: docs/conselho/atas/2026-11-05-plano-metricas-decisao-cliente.md (parecer do cientista de dados em tempo real,
-- item 3 do plano: collector_runs, last_price_confirmed_at, SLOs e alertas).
-- ADITIVA: 2 tabelas novas + 1 coluna NULLABLE sem default (so metadado no Postgres, sem reescrever a tabela) + 1 indice parcial.
-- Nao altera nem le affiliate_price_snapshots. Nenhuma oferta, cotacao ou produto e tocado.
-- Rollback: 0025_collector_runs.rollback.sql.
-- A coluna NAO e adicionada ao schema Drizzle (src/db/schema) de proposito: `db.select().from(affiliateOffers)` lista todas as
-- colunas e quebraria em producao antes da migration. O codigo grava/le a coluna por SQL cru, atras da flag COLLECTOR_RUNS=1.

SET LOCAL lock_timeout = '5s';

-- 1) Uma linha por execucao de cron/coletor (por rede, quando couber). status 'running' que passa de maxDuration + folga
--    = execucao abandonada (timeout da funcao: nenhum "finally" roda), detectada na leitura, nunca gravada pelo job.
CREATE TABLE IF NOT EXISTS collector_runs (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job               text        NOT NULL,                 -- ex.: 'collect-prices', 'collect-shopee', 'discover-products', 'refresh-snapshots:stats'
  network           text,                                 -- slug da rede ('mercado-livre', 'shopee'); NULL em jobs sem rede
  started_at        timestamptz NOT NULL DEFAULT now(),
  finished_at       timestamptz,
  duration_ms       integer,
  status            text        NOT NULL DEFAULT 'running',
  selected          integer,                              -- OFERTAS escolhidas para esta execucao (apos o teto por execucao)
  checked           integer,                              -- CONSULTAS a fonte com resposta valida (ML: 1 consulta = 1 catalog_product_id = 1 grupo de ofertas; Shopee: 1 oferta)
  price_confirmed   integer,                              -- OFERTAS em que a API devolveu preco (base de last_price_confirmed_at)
  snapshots_written integer,                              -- linhas novas em affiliate_price_snapshots (so quando o preco mudou ou no batimento de 24 h)
  misses            integer,                              -- CONSULTAS com resposta valida sem vendedor/preco ("sem vendedor")
  errors            integer,                              -- CONSULTAS que falharam (rede, HTTP != 2xx/404, excecao). Taxas = errors / (checked + errors)
  rate_limited      integer,                              -- subconjunto de errors: HTTP 429 / rate limit
  error_kinds       jsonb,                                -- {"http_429":n,"http_5xx":n,"http_4xx":n,"network":n,"auth":n,"other":n}
  offers_created    integer,
  budget_exhausted  boolean     NOT NULL DEFAULT false,   -- parou por tempo (orcamento) antes de varrer o lote
  stopped_because   text,                                 -- 'orcamento_de_tempo' | 'falhas_seguidas' | 'erro_rate_limit' | ...
  due_total         integer,                              -- ofertas devidas (vencidas) ANTES do teto por execucao
  oldest_due_age_s  integer,                              -- idade (s) da checagem da oferta devida mais velha, no inicio da execucao
  meta              jsonb,                                -- resumo livre e pequeno (sem segredos, sem texto de erro longo)
  CONSTRAINT collector_runs_status_chk CHECK (status IN ('running', 'ok', 'partial', 'error'))
);
CREATE INDEX IF NOT EXISTS collector_runs_job_network_started_idx ON collector_runs (job, network, started_at DESC);
CREATE INDEX IF NOT EXISTS collector_runs_started_idx ON collector_runs (started_at DESC);

-- 2) Estado de alerta (deduplicacao e mensagem de "resolvido"): uma linha por chave de alerta aberta.
CREATE TABLE IF NOT EXISTS collector_alert_state (
  key          text        PRIMARY KEY,                   -- ex.: 'dead_man:mercado-livre'
  opened_at    timestamptz NOT NULL DEFAULT now(),
  last_sent_at timestamptz,
  last_value   jsonb,
  resolved_at  timestamptz
);

-- 3) Confirmacao de preco: gravada SO quando a API devolveu preco para a oferta. O carimbo last_checked_at tambem e
--    renovado no caminho "sem vendedor" e nas ofertas irmas que expiram no mesmo grupo (collect-prices.ts, stampChecked);
--    esta coluna NAO. Sem backfill de proposito (NULL = "sem confirmacao desde a ligacao da flag"); quem le usa
--    COALESCE com o ultimo snapshot como limite conservador. Nao e derivavel com exatidao do historico.
ALTER TABLE affiliate_offers ADD COLUMN IF NOT EXISTS last_price_confirmed_at timestamptz;
CREATE INDEX IF NOT EXISTS affiliate_offers_price_confirmed_idx
  ON affiliate_offers (last_price_confirmed_at)
  WHERE status = 'active' AND external_ref IS NOT NULL;

-- 4) Mesmo padrao de seguranca da 0019/0022/0024: RLS ligado e sem acesso para anon/authenticated.
--    (affiliate_offers ja tem RLS ligado e REVOKE de tabela inteira na 0019: a coluna nova herda.)
ALTER TABLE collector_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE collector_alert_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE collector_runs FROM anon, authenticated;
REVOKE ALL ON TABLE collector_alert_state FROM anon, authenticated;
REVOKE ALL ON SEQUENCE collector_runs_id_seq FROM anon, authenticated;
