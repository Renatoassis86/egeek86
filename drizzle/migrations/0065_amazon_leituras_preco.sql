-- 0065: leituras de preco da Amazon vindas de FONTES EXTERNAS (R-82: camadas de fonte, cada uma valida a outra). Aditiva; nada existente e tocado.
-- Fontes: 'creators_api' (oficial, quando a conta liberar) e 'keepa' (servico de precos de terceiros). A leitura do Chrome continua em affiliate_offers/snapshots.
-- Uma fonte externa so CONFIRMA ou VETA o par (preco cheio, Pix) ja conhecido da oferta; nunca escreve preco sozinha (tipo de preco, R-69).
CREATE TABLE IF NOT EXISTS amazon_leituras_preco (
  id bigserial PRIMARY KEY,
  asin text NOT NULL CHECK (asin ~ '^[A-Z0-9]{10}$'),
  fonte text NOT NULL CHECK (fonte IN ('creators_api','keepa')),
  preco_cents bigint,
  pix_cents bigint,
  disponivel boolean NOT NULL DEFAULT true,
  lido_em timestamptz NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS amazon_leituras_preco_asin_idx ON amazon_leituras_preco (asin, fonte, lido_em DESC);
