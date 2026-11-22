-- 0075 R-117 (dono 2026-11-22: "a mensagem SO sai com informacao real"). Tabela ADITIVA: ultima leitura VIVA de preco e disponibilidade por oferta.
--  * Quem escreve: a vitrine de jogos (ML pela API oficial) e a rota /api/ingest/disponibilidade-viva (aba logada da Shopee, pagina do anuncio).
--  * Quem le: a vitrine (janela de 15 min, padrao negado). Esgotado vira status 'expired' na mesma transacao, com motivo aqui.
-- Rollback: 0075_oferta_verificacao_viva.rollback.sql (VITRINE_VIVO=off ignora a tabela).
SET LOCAL lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS oferta_verificacao_viva (
  offer_id      uuid        PRIMARY KEY,
  verificado_em timestamptz NOT NULL DEFAULT now(),
  fonte         text        NOT NULL,            -- api_ml | pagina_shopee | coleta_amazon
  disponivel    boolean     NOT NULL,            -- ativo e com estoque
  preco_cents   integer,                         -- preco de lista vivo (sem cupom); null quando indisponivel
  motivo        text
);
