-- 0073 R-112 (ata 2026-11-20 "pistas autonomas", Fase 1, modo SOMBRA): coluna `tipo` em group_messages e duas tabelas novas. ADITIVA.
--  * group_messages.tipo: ADD COLUMN nula, sem default = so catalogo (nao reescreve a tabela). Indice (vertical, tipo, created_at) depois,
--    com CREATE INDEX CONCURRENTLY fora de transacao (ver scripts/apply-pistas-sombra.ts --indice), em horario calmo.
--  * pista_contador: contador por canal/hora/tipo/marca (INSERT ... ON CONFLICT DO UPDATE). Retencao 7 dias (o cron de sombra apaga).
--  * pista_decisao: o que a admissao "enviaria"/"descartaria" em sombra, com o motivo. Retencao 7 dias. Nada aqui envia mensagem.
-- Rollback: 0073_pistas_sombra.rollback.sql.
SET LOCAL lock_timeout = '3s';

ALTER TABLE group_messages ADD COLUMN IF NOT EXISTS tipo text;

CREATE TABLE IF NOT EXISTS pista_contador (
  canal       text        NOT NULL,                -- vertical/canal (ex.: livros)
  hora_bucket timestamptz NOT NULL,                -- inicio da hora (UTC)
  tipo        text        NOT NULL,
  marca       text        NOT NULL DEFAULT '',     -- '' = sem marca
  n           integer     NOT NULL DEFAULT 0,
  atualizado  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (canal, hora_bucket, tipo, marca)
);
CREATE INDEX IF NOT EXISTS pista_contador_hora_idx ON pista_contador (hora_bucket);

CREATE TABLE IF NOT EXISTS pista_decisao (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  criado_em   timestamptz NOT NULL DEFAULT now(),
  canal       text        NOT NULL,
  mensagem_id uuid        NOT NULL,                -- group_messages.id avaliada (sem FK: a retencao das duas tabelas e independente)
  master_id   uuid,
  oferta_id   uuid,
  tipo        text,
  marca       text,
  decisao     text        NOT NULL,
  motivo      text        NOT NULL,
  cota_usada  integer     NOT NULL DEFAULT 0,      -- envios simulados do canal na hora, antes desta decisao
  janela      timestamptz NOT NULL,                -- hora (UTC) da decisao
  CONSTRAINT pista_decisao_decisao_chk CHECK (decisao IN ('enviaria', 'descartaria')),
  CONSTRAINT pista_decisao_msg_uq UNIQUE (mensagem_id)
);
CREATE INDEX IF NOT EXISTS pista_decisao_canal_janela_idx ON pista_decisao (canal, janela);
CREATE INDEX IF NOT EXISTS pista_decisao_criado_idx ON pista_decisao (criado_em);

ALTER TABLE pista_contador ENABLE ROW LEVEL SECURITY;
ALTER TABLE pista_decisao  ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE pista_contador FROM anon, authenticated;
REVOKE ALL ON TABLE pista_decisao  FROM anon, authenticated;
