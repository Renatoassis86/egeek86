-- 0068: RESUMO INCREMENTAL DE COTACOES POR OFERTA (dono 2026-11-19: "metodo mais de ponta, sem perder informacao"). ADITIVA: 3 tabelas novas; nada existente e alterado.
-- Guarda, por (oferta, preco), quantas cotacoes (affiliate_price_snapshots) tiveram aquele preco e a primeira/ultima data. E suficiente para reproduzir EXATAMENTE
-- as colunas de product_price_stats (contagem, media, minimos por janela, mediana, piso, teto) sem varrer as cotacoes: o recalculo le so as cotacoes NOVAS.
-- Flags de vendedor fraco, avg_excluded, identidade e catalogo sao aplicados AO VIVO sobre o resumo (por oferta), nao ficam gravados aqui.
-- A cotacao NUNCA e apagada. Desligar sem rollback: PRICE_STATS_ROLLUP=off. Rollback: 0068_product_price_rollup.rollback.sql.
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS product_price_rollup (
  offer_id    uuid        NOT NULL,
  price_cents bigint      NOT NULL,
  n           integer     NOT NULL CHECK (n > 0),
  first_at    timestamptz NOT NULL,
  last_at     timestamptz NOT NULL,
  PRIMARY KEY (offer_id, price_cents)
);

-- Uma linha por oferta com resumo construido: base_id = maior id de cotacao ja contado na construcao (a janela incremental le id > base_id).
CREATE TABLE IF NOT EXISTS product_price_rollup_state (
  offer_id  uuid        PRIMARY KEY,
  base_id   bigint      NOT NULL,
  built_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS product_price_rollup_state_built_idx ON product_price_rollup_state (built_at);

-- Linha unica (id = 1): marca d'agua global da janela incremental (maior id de cotacao ja lido) e a flag do filtro de isca com que o resumo foi feito.
CREATE TABLE IF NOT EXISTS product_price_rollup_meta (
  id          smallint    PRIMARY KEY CHECK (id = 1),
  last_id     bigint      NOT NULL,
  isca_on     boolean     NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE product_price_rollup ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_price_rollup_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_price_rollup_meta ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE product_price_rollup, product_price_rollup_state, product_price_rollup_meta FROM anon, authenticated;
