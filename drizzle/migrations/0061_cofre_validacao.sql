-- 0061 (R-64, 2026-11-16): COFRE DE VALIDACAO OBRIGATORIA de cupom e beneficio. ADITIVA e idempotente: duas tabelas novas; nenhuma oferta, cupom ou leitura e alterado.
-- coupon_validations: UMA linha por (oferta, cupom/beneficio) com o estado atual e a prova que sustenta a divulgacao.
-- coupon_validation_trail: trilha de auditoria (por que foi liberado, barrado ou revogado), gravada so quando o estado MUDA.
CREATE TABLE IF NOT EXISTS coupon_validations (
  id bigserial PRIMARY KEY,
  offer_id uuid NOT NULL REFERENCES affiliate_offers(id) ON DELETE CASCADE,
  coupon_ref text NOT NULL,
  kind text NOT NULL,                -- 'cupom' | 'beneficio'
  network_slug text NOT NULL,
  proof_type text,                   -- modal_oficial_do_item | bloco_de_compra_escopado | valor_final_impresso_pela_pagina | simulacao_de_checkout
  state text NOT NULL,               -- lido | validado | divulgavel | revalidando | revogado
  motivo text,
  proved jsonb,                      -- nome, valor final, minimo provados
  read_at timestamptz,
  validated_at timestamptz,
  expires_at timestamptz,
  validator text,                    -- leitor/arquivo que produziu a prova
  revoked_at timestamptz,
  last_decided_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (offer_id, coupon_ref)
);
CREATE INDEX IF NOT EXISTS coupon_validations_state_idx ON coupon_validations (state, expires_at);
CREATE INDEX IF NOT EXISTS coupon_validations_net_idx ON coupon_validations (network_slug, last_decided_at DESC);
CREATE TABLE IF NOT EXISTS coupon_validation_trail (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  offer_id uuid NOT NULL,
  coupon_ref text NOT NULL,
  network_slug text NOT NULL,
  kind text NOT NULL,
  uso text,
  acao text NOT NULL,                -- liberado | barrado | revogado | revalidando
  motivo text,
  proof_type text,
  detalhe jsonb
);
CREATE INDEX IF NOT EXISTS coupon_validation_trail_at_idx ON coupon_validation_trail (at DESC);
CREATE INDEX IF NOT EXISTS coupon_validation_trail_net_idx ON coupon_validation_trail (network_slug, acao, at DESC);
