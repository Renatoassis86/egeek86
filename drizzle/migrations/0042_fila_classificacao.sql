-- 0042: FILA DE CLASSIFICACAO de identidade dos itens + decisoes do dono que viram regra (dono, 2026-11-11; ADR 0011 rascunho). PROPOSTA: NAO aplicada,
-- NAO registrada em meta/_journal.json (como 0019-0041). ADITIVA: cria duas tabelas novas; nenhuma oferta, master, cotacao ou mensagem e tocado aqui.
-- Rollback: 0042_fila_classificacao.rollback.sql. Aplicar com: npx tsx --env-file=.env.local scripts/apply-fila-classificacao.ts --apply (apenas o dono).
-- Sem FK para affiliate_offers/master_products DE PROPOSITO: a decisao e trilha de auditoria (sobrevive a oferta apagada) e o CREATE nao trava as
-- tabelas quentes do coletor. O codigo valida a existencia da oferta/master na hora de aplicar.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Decisoes do dono. Cada linha e uma resposta e, quando is_rule, tambem uma REGRA reaproveitada para titulos iguais/muito parecidos.
CREATE TABLE IF NOT EXISTS identity_decisions (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id            uuid,                                   -- item da fila que originou (NULL em auto_regra sem item)
  offer_id           uuid        NOT NULL,
  vertical           text        NOT NULL DEFAULT 'games',
  axis               text        NOT NULL,                   -- modelo | midia | armazenamento | identidade | preco
  value              text        NOT NULL,                   -- valor escolhido (ex.: 'slim', '1000gb', 'sim', 'nao_e_este', 'nao_sei')
  value_label        text,
  kind               text        NOT NULL DEFAULT 'escolha', -- escolha | nao_sei | nao_e_este | auto_regra
  title              text        NOT NULL,
  title_norm         text        NOT NULL,                   -- titulo normalizado (chave da regra)
  from_master_id     uuid,
  to_master_id       uuid,
  created_master_id  uuid,                                   -- master criado por esta decisao (desfazer arquiva)
  prev_status        text,                                   -- status da oferta antes (desfazer restaura)
  prev_quarantined_at timestamptz,
  decided_by         uuid,                                   -- profiles.id de quem decidiu (NULL = regra automatica)
  decided_at         timestamptz NOT NULL DEFAULT now(),
  rule_source_id     uuid,                                   -- decisao-regra que resolveu sozinha (auto_regra)
  is_rule            boolean     NOT NULL DEFAULT true,      -- 'nao_sei' nunca e regra
  undone_at          timestamptz,
  undone_by          uuid,
  recalc_masters     uuid[]      NOT NULL DEFAULT '{}',      -- masters a recalcular (a fila de recalculo)
  recalc_done_at     timestamptz,
  CONSTRAINT identity_decisions_axis_chk CHECK (axis IN ('modelo','midia','armazenamento','identidade','preco')),
  CONSTRAINT identity_decisions_kind_chk CHECK (kind IN ('escolha','nao_sei','nao_e_este','auto_regra'))
);
CREATE INDEX IF NOT EXISTS identity_decisions_rule_idx ON identity_decisions (vertical, axis, title_norm) WHERE is_rule AND undone_at IS NULL;
CREATE INDEX IF NOT EXISTS identity_decisions_offer_idx ON identity_decisions (offer_id, decided_at DESC);
CREATE INDEX IF NOT EXISTS identity_decisions_recalc_idx ON identity_decisions (decided_at) WHERE recalc_done_at IS NULL AND cardinality(recalc_masters) > 0;

-- Fila: 1 item por (oferta, eixo) para sempre (geracao idempotente: ON CONFLICT DO NOTHING). Desfazer volta o item para 'pending'.
CREATE TABLE IF NOT EXISTS identity_review_items (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id       uuid        NOT NULL,
  master_id      uuid,
  vertical       text        NOT NULL DEFAULT 'games',
  axis           text        NOT NULL,
  source         text        NOT NULL,                       -- chave_nd | confianca | dispersao | preco
  reason         text        NOT NULL,                       -- por que e duvida (texto para o dono)
  understood     jsonb       NOT NULL DEFAULT '{}'::jsonb,   -- o que o sistema entende (serie/modelo, chave, confianca)
  options        jsonb       NOT NULL,                       -- [{value,label,hint,targetMasterId,createMaster}]
  title          text        NOT NULL,
  title_norm     text        NOT NULL,
  status         text        NOT NULL DEFAULT 'pending',     -- pending | resolved | auto_resolved
  snoozed_until  timestamptz,                                -- 'nao sei': volta a perguntar depois
  decision_id    uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  resolved_at    timestamptz,
  CONSTRAINT identity_review_items_status_chk CHECK (status IN ('pending','resolved','auto_resolved')),
  CONSTRAINT identity_review_items_axis_chk CHECK (axis IN ('modelo','midia','armazenamento','identidade','preco')),
  CONSTRAINT identity_review_items_source_chk CHECK (source IN ('chave_nd','confianca','dispersao','preco')),
  CONSTRAINT identity_review_items_offer_axis_uq UNIQUE (offer_id, axis)
);
CREATE INDEX IF NOT EXISTS identity_review_items_pending_idx ON identity_review_items (created_at) WHERE status = 'pending';

-- Mesmo padrao das tabelas internas (0019/0022/0040): RLS ligado, sem acesso para anon/authenticated (o app usa a conexao de servico).
ALTER TABLE identity_decisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE identity_decisions FROM anon, authenticated;
ALTER TABLE identity_review_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE identity_review_items FROM anon, authenticated;
