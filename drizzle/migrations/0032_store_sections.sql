-- Lojas (secoes) com canal proprio (2026-11-11). Plano: docs/plano-lojas-secoes-canais-2026-11-11.md (secao 1.1 a 1.5, Parte II trilha A1).
-- NAO registrada em meta/_journal.json de proposito (como 0019-0031). Aplicar com scripts/apply-lojas.ts (backup + contagens + rollback testado).
-- ADITIVA e INERTE: nada do envio le estas tabelas ainda. Nao toca master_products, affiliate_offers nem price_*.
--   * 3 tabelas novas: store_sections, store_section_verticals, telegram_chat_discoveries.
--   * group_messages ganha store_id NULLABLE (FK) + indice; backfill pela vertical (loja games) na mesma transacao.
--   * Seed: loja 'games' (limites ATUAIS: 400/dia, 60/hora, 1 min) e demais lojas em rascunho/desligadas, SEM chat id.
--   * Estado de envio por loja NAO e gravado aqui (flag 'group_messages_auto:<slug>' ausente = off; games herda o global).
-- Rollback: 0032_store_sections.rollback.sql.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE IF NOT EXISTS store_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,30}$'),
  name text NOT NULL,
  stage text NOT NULL DEFAULT 'rascunho'
    CHECK (stage IN ('rascunho','aguardando_canal','canal_verificado','semeando','catalogo_em_revisao','links_prontos','shadow','ativa','pausada')),
  telegram_chat_id text,
  telegram_chat_title text,
  telegram_invite_url text,
  telegram_verified_at timestamptz,
  telegram_bot_can_post boolean NOT NULL DEFAULT false,
  whatsapp_group_url text,
  limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  search_menu jsonb NOT NULL DEFAULT '{}'::jsonb,
  brand jsonb NOT NULL DEFAULT '{}'::jsonb,
  ad_tag text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS store_sections_chat_uniq ON store_sections (telegram_chat_id) WHERE telegram_chat_id IS NOT NULL;

-- Uma vertical pertence a UMA loja (PK). A lista inclui impressao3d para nao depender da ordem entre 0032 e 0033.
CREATE TABLE IF NOT EXISTS store_section_verticals (
  vertical text PRIMARY KEY CHECK (vertical IN ('games','tecnologia','eletroeletronicos','livros','eletrodomesticos','esporte','impressao3d')),
  store_id uuid NOT NULL REFERENCES store_sections(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS telegram_chat_discoveries (
  chat_id text PRIMARY KEY,
  title text,
  type text,
  username text,
  bot_status text,
  can_post boolean,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  claimed_store_id uuid REFERENCES store_sections(id)
);

ALTER TABLE group_messages ADD COLUMN IF NOT EXISTS store_id uuid NULL REFERENCES store_sections(id);
CREATE INDEX IF NOT EXISTS group_messages_store_idx ON group_messages (store_id, channel, sent_at);

-- Seed. Games com os valores de HOJE (RULES em group-rules.ts) para a paridade ser comprovavel. Chat id NAO entra aqui
-- (o do games vem do ambiente TELEGRAM_GROUP_CHAT_ID; as demais lojas nao tem canal).
INSERT INTO store_sections (slug, name, stage, limits, brand) VALUES
  ('games', 'Games', 'ativa',
   '{"dailyCap":400,"hourlyCap":60,"soundCap":20,"spacingDayMin":1,"spacingNightMin":1,"classCaps":{"alerta":400,"radar":400,"insight":400,"resumo":400,"cupom":400,"plataforma":400},"productGapMin":90,"cardDailyCap":4,"night":{"from":22,"until":8},"radarComposite":false,"diversityBy":"platform","classes":["alerta","insight","radar","resumo","cupom","plataforma"],"blackFridayDailyCap":400}'::jsonb,
   '{"label":"Games"}'::jsonb),
  ('tecnologia', 'Tecnologia', 'rascunho', '{}'::jsonb, '{"label":"Tecnologia"}'::jsonb),
  ('eletrodomesticos', 'Eletrodomésticos', 'rascunho', '{}'::jsonb, '{"label":"Eletrodomésticos"}'::jsonb),
  ('eletroeletronicos', 'Eletroeletrônicos', 'rascunho', '{}'::jsonb, '{"label":"Eletroeletrônicos"}'::jsonb),
  ('livros', 'Livros', 'rascunho', '{}'::jsonb, '{"label":"Livros"}'::jsonb),
  ('esporte', 'Esporte', 'rascunho', '{}'::jsonb, '{"label":"Esporte"}'::jsonb),
  ('impressao-3d', 'Impressão 3D', 'rascunho', '{}'::jsonb, '{"label":"Impressão 3D"}'::jsonb)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO store_section_verticals (vertical, store_id)
SELECT m.vertical, s.id
FROM (VALUES ('games','games'),('tecnologia','tecnologia'),('eletrodomesticos','eletrodomesticos'),('eletroeletronicos','eletroeletronicos'),
             ('livros','livros'),('esporte','esporte'),('impressao3d','impressao-3d')) AS m(vertical, slug)
JOIN store_sections s ON s.slug = m.slug
ON CONFLICT (vertical) DO NOTHING;

-- Backfill (tabela pequena: cabe na transacao). Idempotente: so linhas ainda sem loja.
UPDATE group_messages g
SET store_id = v.store_id
FROM store_section_verticals v
WHERE g.vertical = v.vertical AND g.store_id IS NULL;

-- RLS: padrao do projeto (0028/0029): tabelas novas sem acesso para anon/authenticated. O servidor acessa por conexao propria.
ALTER TABLE store_sections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE store_sections FROM anon, authenticated;
ALTER TABLE store_section_verticals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE store_section_verticals FROM anon, authenticated;
ALTER TABLE telegram_chat_discoveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE telegram_chat_discoveries FROM anon, authenticated;
