-- 0074 R-116 (dono 2026-11-22: vitrine de jogos so com jogo NOVO). Tabela ADITIVA com a pontuacao do modelo de foto (R-109) por imagem.
--  * Quem escreve: scripts/foto-vitrine-pontuar.ts (CLIP local, fora do caminho do envio). Quem le: a vitrine de jogos (LEFT JOIN por md5 da URL).
--  * Chave = md5(image_url): a mesma imagem nunca e pontuada duas vezes (cache). Sem linha = sem pontuacao = o jogo NAO entra (padrao negado).
-- Rollback: 0074_vitrine_foto_pontuacao.rollback.sql (a vitrine volta a exigir pontuacao; com VITRINE_FOTO=off ignora a tabela).
SET LOCAL lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS vitrine_foto_pontuacao (
  url_hash     text        PRIMARY KEY,              -- md5(image_url)
  image_url    text        NOT NULL,
  faixa        text        NOT NULL,                 -- alto | medio | baixo
  pontuacao    real        NOT NULL,                 -- 0..1 (regressao logistica sobre CLIP)
  motivo       text,                                 -- foto_com_mao | foto_com_varios_jogos | null
  razoes       text,
  dist_catalogo smallint,                            -- bits de dHash ate a imagem do catalogo (<= 8 = capa oficial)
  versao       integer     NOT NULL,                 -- FOTO_NAO_NOVA_VERSAO
  pontuado_em  timestamptz NOT NULL DEFAULT now()
);
