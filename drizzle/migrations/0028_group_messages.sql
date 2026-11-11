-- Mensagens automaticas para grupos (2026-11-10). PROPOSTA: NAO aplicada, NAO registrada em meta/_journal.json de proposito
-- (como 0019-0027). Aplicar so com aprovacao do dono, com backup antes:
--   npx tsx --env-file=.env.local scripts/apply-group-messages.ts            # dry-run (so confere o estado)
--   npx tsx --env-file=.env.local scripts/apply-group-messages.ts --apply
-- Ata: docs/conselho/atas/2026-11-10-mensagens-automaticas-para-grupos.md. Doc: docs/mensagens-grupos-2026-11-10.md.
-- ADITIVA: 1 tabela nova. Nao altera nem le nenhuma tabela existente. Sem FK de proposito (nao trava fusao/arquivamento de masters/ofertas).
-- Uma linha por candidato E por canal ('tg' = Telegram automatico com aprovacao; 'wa' = WhatsApp assistido: o texto e copiado/aberto no wa.me).
-- Rollback: 0028_group_messages.rollback.sql.

SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS group_messages (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  message_key          text        NOT NULL,                 -- o `m` do link /go/<slug>?s=<tg|wa>&m=<message_key>
  trigger              text        NOT NULL,                 -- G1..G6 (ata)
  channel              text        NOT NULL,                 -- 'tg' | 'wa'
  vertical             text        NOT NULL DEFAULT 'games',
  master_product_id    uuid,                                 -- NULL no resumo do dia (varios produtos; ver candidate)
  offer_id             uuid,                                 -- oferta principal
  price_cents_detected bigint,                               -- preco da oferta principal na deteccao (base da revalidacao de 2 %)
  avg_cents            bigint,                               -- media do periodo usada no texto (oferta-dia, a mesma do selo)
  needs_review         boolean     NOT NULL DEFAULT false,   -- true = so com aprovacao humana (Shopee, desconto > 40 %, sem reputacao...)
  candidate            jsonb       NOT NULL,                 -- candidato completo (motivo, bloqueios, ofertas citadas); sem segredos
  text_body            text        NOT NULL,                 -- texto do canal (Telegram em HTML, WhatsApp em texto simples); ao enviar, o texto efetivamente enviado
  dedup_key            text        NOT NULL,                 -- <master>:<gatilho>:<janela de 6 h>; UNIQUE por canal
  status               text        NOT NULL DEFAULT 'proposta',
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  approved_at          timestamptz,
  approved_by          uuid,                                 -- profiles.id do admin (sem FK)
  claimed_at           timestamptz,                          -- trava de envio (evita clique + cron ao mesmo tempo); expira em 10 min
  sent_at              timestamptz,
  provider_message_id  text,                                 -- message_id devolvido pelo Telegram
  error                text,                                 -- ultimo erro (sem token; texto curto)
  CONSTRAINT group_messages_status_chk  CHECK (status IN ('proposta', 'aprovada', 'enviada', 'rejeitada', 'expirada', 'erro')),
  CONSTRAINT group_messages_channel_chk CHECK (channel IN ('tg', 'wa')),
  CONSTRAINT group_messages_trigger_chk CHECK (trigger IN ('G1', 'G2', 'G3', 'G4', 'G5', 'G6')),
  CONSTRAINT group_messages_key_chk     CHECK (message_key ~ '^[a-z0-9-]{3,40}$'),
  CONSTRAINT group_messages_dedup_uq    UNIQUE (dedup_key, channel)
);
CREATE INDEX IF NOT EXISTS group_messages_status_created_idx ON group_messages (status, created_at DESC);
CREATE INDEX IF NOT EXISTS group_messages_product_sent_idx   ON group_messages (master_product_id, sent_at DESC) WHERE status = 'enviada';
CREATE INDEX IF NOT EXISTS group_messages_key_idx            ON group_messages (message_key);

-- Mesmo padrao de seguranca da 0019/0022/0024/0025: RLS ligado e sem acesso para anon/authenticated (so o servidor, via DATABASE_URL).
ALTER TABLE group_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE group_messages FROM anon, authenticated;
