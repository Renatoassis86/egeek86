-- 0040: historico diario do inventario do catalogo, por loja (vertical). Dono, 2026-11-11.
-- ADITIVA: cria uma tabela nova; nenhuma tabela existente e tocada. Reversivel (0040_catalog_inventory_snapshots.rollback.sql).
-- 1 linha por (dia, loja), gravada por upsert pelo cron /api/cron/refresh-snapshots?part=inventory. Dia = data em America/Sao_Paulo.
-- Contagens vem do que esta no banco no instante da gravacao (nenhum dado estimado ou preenchido).
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
CREATE TABLE IF NOT EXISTS catalog_inventory_snapshots (
  day                 date        NOT NULL,
  vertical            text        NOT NULL,
  masters_approved    integer     NOT NULL DEFAULT 0,
  masters_review      integer     NOT NULL DEFAULT 0,
  masters_rejected    integer     NOT NULL DEFAULT 0,
  masters_with_avg    integer     NOT NULL DEFAULT 0,   -- masters aprovados com media unica (price_daily_state) calculada
  offers_active_ml    integer     NOT NULL DEFAULT 0,
  offers_active_shopee integer    NOT NULL DEFAULT 0,
  offers_active_amazon integer    NOT NULL DEFAULT 0,
  offers_active_other integer     NOT NULL DEFAULT 0,
  offers_official     integer     NOT NULL DEFAULT 0,   -- ofertas ativas com link oficial de afiliado (ML: meli.la)
  pct_official        numeric(5,2),                     -- offers_official / ofertas ativas; NULL sem ofertas
  computed_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (day, vertical),
  CONSTRAINT catalog_inventory_snapshots_vertical_chk CHECK (vertical IN ('games','tecnologia','eletroeletronicos','livros','eletrodomesticos','esporte','impressao3d'))
);
CREATE INDEX IF NOT EXISTS catalog_inventory_snapshots_vertical_day_idx ON catalog_inventory_snapshots (vertical, day DESC);
-- Mesmo padrao de seguranca das tabelas internas (0019/0022): RLS ligado, sem acesso para anon/authenticated (o app usa a conexao de servico).
ALTER TABLE catalog_inventory_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE catalog_inventory_snapshots FROM anon, authenticated;
