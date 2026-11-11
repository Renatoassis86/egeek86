-- Motor de mensagens v2 (ONDA 1, 2026-11-10). PROPOSTA: NAO aplicada, NAO registrada em meta/_journal.json de proposito
-- (como 0019-0029). Aplicar so com aprovacao do dono, com backup antes (pg_dump -t group_messages).
-- Ata: docs/conselho/atas/2026-11-10-mensagens-24h-cupons-storytelling-cobertura.md (secoes 1, 2, 8). Doc: docs/mensagens-grupos-2026-11-10.md.
-- ADITIVA sobre a 0028 (tabela group_messages ja existe em producao, vazia): so acrescenta colunas, amplia dois CHECK e cria
-- 2 tabelas novas. NAO toca affiliate_offers, price_*, master_products nem nenhuma tabela de outro engenheiro (a 0029 e dos cupons).
-- Sem este arquivo aplicado o codigo continua no comportamento da 0028 (propostas manuais) e a automacao shadow/on e recusada.
-- Rollback: 0030_group_messages_v2.rollback.sql.

SET LOCAL lock_timeout = '5s';

-- 1) Colunas novas de group_messages ------------------------------------------------------------------------------
ALTER TABLE group_messages
  ADD COLUMN IF NOT EXISTS msg_class              text,                          -- alerta | radar | insight | resumo | cupom
  ADD COLUMN IF NOT EXISTS is_sound               boolean      NOT NULL DEFAULT false, -- true = enviada COM notificacao sonora (orcamento de 8/dia)
  ADD COLUMN IF NOT EXISTS has_card               boolean      NOT NULL DEFAULT false, -- saiu como foto (cartao de historico)
  ADD COLUMN IF NOT EXISTS sim_state              text,                          -- modo sombra: 'enviaria_som' | 'enviaria_silenciosa' (decisao simulada)
  ADD COLUMN IF NOT EXISTS automation_state       text,                          -- estado da automacao quando a linha foi decidida: off | shadow | on
  ADD COLUMN IF NOT EXISTS attempts               integer      NOT NULL DEFAULT 0, -- tentativas de envio (maximo 3)
  ADD COLUMN IF NOT EXISTS claim_from             text,                          -- status de origem da reivindicacao (para devolver se o envio falhar)
  ADD COLUMN IF NOT EXISTS recheck_due_at         timestamptz,                   -- 30 min depois do envio
  ADD COLUMN IF NOT EXISTS recheck_at             timestamptz,                   -- quando a reconferencia foi feita (reconferido_em)
  ADD COLUMN IF NOT EXISTS recheck_price_cents    bigint,                        -- preco da oferta na reconferencia
  ADD COLUMN IF NOT EXISTS recheck_divergence_pct numeric(7,2),                  -- |reconferido - enviado| / enviado, em %
  ADD COLUMN IF NOT EXISTS recheck_note           text;                          -- 'ok' | 'oferta_inativa' | 'sem_preco' ... (nunca se apaga mensagem do canal)

-- 2) CHECKs ampliados (valores novos de status, gatilho e classe) ------------------------------------------------
--    status: proposta_auto = segura, espera o turno do cron; simulada = decisao do modo sombra (nao enviada);
--            retida = faixa vermelha, so aparece no admin; enviando = reivindicada por uma execucao (trava contra envio duplo).
ALTER TABLE group_messages DROP CONSTRAINT IF EXISTS group_messages_status_chk;
ALTER TABLE group_messages ADD CONSTRAINT group_messages_status_chk
  CHECK (status IN ('proposta', 'aprovada', 'enviada', 'rejeitada', 'expirada', 'erro', 'proposta_auto', 'simulada', 'retida', 'enviando'));

ALTER TABLE group_messages DROP CONSTRAINT IF EXISTS group_messages_trigger_chk;
ALTER TABLE group_messages ADD CONSTRAINT group_messages_trigger_chk
  CHECK (trigger IN ('G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'OK1', 'OK2', 'T1', 'T2', 'RADAR', 'CUPOM'));

ALTER TABLE group_messages DROP CONSTRAINT IF EXISTS group_messages_class_chk;
ALTER TABLE group_messages ADD CONSTRAINT group_messages_class_chk
  CHECK (msg_class IS NULL OR msg_class IN ('alerta', 'radar', 'insight', 'resumo', 'cupom'));

CREATE INDEX IF NOT EXISTS group_messages_recheck_idx ON group_messages (recheck_due_at)
  WHERE status = 'enviada' AND recheck_at IS NULL;
CREATE INDEX IF NOT EXISTS group_messages_auto_idx ON group_messages (status, created_at)
  WHERE status IN ('proposta_auto', 'aprovada', 'enviando');

-- 3) Contagem de inscritos (freio automatico por saida; getChatMemberCount a cada hora) -------------------------
CREATE TABLE IF NOT EXISTS group_member_counts (
  id            bigserial   PRIMARY KEY,
  chat_id       text        NOT NULL,
  member_count  integer     NOT NULL CHECK (member_count >= 0),
  counted_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS group_member_counts_at_idx ON group_member_counts (chat_id, counted_at DESC);

-- 4) Amazon: ausencia e volta da oferta na busca da coleta assistida ---------------------------------------------
--    absent_since = primeira vez que o cron viu consecutive_miss_count > 0; returned_at = primeira observacao depois
--    da volta. A oferta so volta a disparar com 2 observacoes separadas por >= 15 min (returned_at -> last_price_confirmed_at).
--    Sem FK de proposito (nao trava fusao/arquivamento de ofertas).
CREATE TABLE IF NOT EXISTS group_offer_watch (
  offer_id      uuid        PRIMARY KEY,
  absent_since  timestamptz,
  returned_at   timestamptz,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Mesmo padrao de seguranca da 0019/0022/0024/0025/0028: RLS ligado e sem acesso para anon/authenticated (so o servidor, via DATABASE_URL).
ALTER TABLE group_member_counts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE group_member_counts FROM anon, authenticated;
ALTER TABLE group_offer_watch ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE group_offer_watch FROM anon, authenticated;
REVOKE ALL ON SEQUENCE group_member_counts_id_seq FROM anon, authenticated;

-- A chave da automacao NAO e criada aqui: a linha 'group_messages_auto' de feature_flags nasce quando o admin escolhe o estado
-- na tela /admin/mensagens (linha ausente = 'off'). Estrutura: enabled boolean + rules jsonb {"state":"off|shadow|on","maxMemberDropPct":5}.
