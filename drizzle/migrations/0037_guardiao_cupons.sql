-- 0037: Agente de Cupons / Guardiao (2026-11-11). PROPOSTA: NAO aplicada, NAO registrada em meta/_journal.json (como 0019-0036).
-- ADITIVA: 2 tabelas novas, sem FK para tabelas existentes de proposito (nao trava fusao/arquivamento de ofertas e lojas).
-- Rollback: 0037_guardiao_cupons.rollback.sql (so apaga as duas tabelas; nenhuma oferta, cotacao, cupom ou mensagem e tocado).
-- Aplicar com: npx tsx --env-file=.env.local scripts/apply-guardiao-cupons.ts --apply  (apenas o dono).
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- 1) Cupons que JA DIVULGAMOS num grupo. Uma linha aberta (ended_at NULL) por cupom e area; o guardiao fecha com motivo.
CREATE TABLE IF NOT EXISTS coupon_announcements (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  network_slug     text        NOT NULL,                  -- 'mercado-livre' | 'shopee' | 'amazon'
  kind             text        NOT NULL,                  -- anuncio | campanha | loja | categoria
  coupon_ref       text        NOT NULL,                  -- anuncio: offer_id; campanha/loja/categoria: coupon_items.id
  label            text        NOT NULL,                  -- o que a mensagem mostrou (codigo ou "R$ 315,46 com cupom")
  offer_id         uuid,                                  -- oferta da mensagem que divulgou (sem FK)
  vertical         text        NOT NULL,
  store_id         uuid,                                  -- store_sections.id (sem FK)
  group_message_id uuid,                                  -- group_messages.id da ultima divulgacao (sem FK)
  first_sent_at    timestamptz NOT NULL DEFAULT now(),
  last_sent_at     timestamptz NOT NULL DEFAULT now(),    -- ultima divulgacao (reenvio com o mesmo cupom atualiza)
  last_checked_at  timestamptz,                           -- ultima verificacao do guardiao
  ended_at         timestamptz,
  end_reason       text,                                  -- sumiu_da_pagina | venceu | cancelado_pelo_dono | sem_leitura_recente | oferta_inativa
  end_notified_at  timestamptz,                           -- card "Cupom encerrado" enviado (no maximo 1 por cupom)
  CONSTRAINT coupon_announcements_kind_chk CHECK (kind IN ('anuncio', 'campanha', 'loja', 'categoria')),
  CONSTRAINT coupon_announcements_end_chk CHECK (ended_at IS NOT NULL OR (end_reason IS NULL AND end_notified_at IS NULL))
);
-- Um cupom aberto por area: o reenvio com o mesmo cupom e UPSERT, nao linha nova.
CREATE UNIQUE INDEX IF NOT EXISTS coupon_announcements_open_uq ON coupon_announcements (coupon_ref, vertical) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS coupon_announcements_ended_idx ON coupon_announcements (ended_at DESC) WHERE ended_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS coupon_announcements_notified_idx ON coupon_announcements (store_id, end_notified_at DESC) WHERE end_notified_at IS NOT NULL;

-- 2) Auditoria: cada consulta do motor ("ha cupom ativo e testado para esta oferta?") e o que respondeu.
CREATE TABLE IF NOT EXISTS coupon_consults (
  id           bigserial   PRIMARY KEY,
  offer_id     uuid        NOT NULL,
  consulted_at timestamptz NOT NULL DEFAULT now(),
  found        boolean     NOT NULL,
  source       text,                                      -- item | campanha | loja_categoria | NULL quando nao achou
  coupon_ref   text
);
CREATE INDEX IF NOT EXISTS coupon_consults_at_idx ON coupon_consults (consulted_at DESC);
CREATE INDEX IF NOT EXISTS coupon_consults_offer_idx ON coupon_consults (offer_id, consulted_at DESC);

-- Mesmo padrao de seguranca das demais: RLS ligado e sem acesso para anon/authenticated (so o servidor, via DATABASE_URL).
ALTER TABLE coupon_announcements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE coupon_announcements FROM anon, authenticated;
ALTER TABLE coupon_consults ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE coupon_consults FROM anon, authenticated;
REVOKE ALL ON SEQUENCE coupon_consults_id_seq FROM anon, authenticated;
