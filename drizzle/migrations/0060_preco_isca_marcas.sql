-- 0060: GATILHO PERMANENTE DE PRECO-ISCA (dono, 2026-11-16; Fluxo Mestre R-61). ADITIVA: uma tabela nova, nada existente e alterado.
-- Cada cotacao (snapshot) marcada como isca (preco muito abaixo dos outros anuncios do mesmo produto) fica aqui com o motivo e os numeros da decisao.
-- A cotacao NAO e apagada nem alterada: as metricas apenas a ignoram enquanto liberado_em IS NULL. Liberar = preencher liberado_em (reversivel).
-- Fora do journal do Drizzle (molde 0044-0059). Rollback: 0060_preco_isca_marcas.rollback.sql. Desligar sem rollback: GATILHO_PRECO_ISCA=0.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE IF NOT EXISTS preco_isca_marcas (
  snapshot_id bigint PRIMARY KEY,
  offer_id uuid NOT NULL,
  master_product_id uuid NOT NULL,
  price_cents bigint NOT NULL,
  mediana_ref_cents bigint,
  razao numeric(7,4),
  vendedores_ref integer,
  motivo text NOT NULL DEFAULT 'preco_isca_abaixo_dos_outros_anuncios',
  origem text NOT NULL,
  marcado_em timestamptz NOT NULL DEFAULT now(),
  liberado_em timestamptz,
  liberado_motivo text
);
CREATE INDEX IF NOT EXISTS preco_isca_marcas_offer_vigente_idx ON preco_isca_marcas (offer_id) WHERE liberado_em IS NULL;
CREATE INDEX IF NOT EXISTS preco_isca_marcas_master_idx ON preco_isca_marcas (master_product_id, marcado_em DESC);
