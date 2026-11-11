-- Motor de mensagens v2 (ONDA 2, 2026-11-11). PROPOSTA: NAO aplicada, NAO registrada em meta/_journal.json de proposito
-- (como 0019-0030). Aplicar so com aprovacao do dono, com backup antes (pg_dump -t group_messages).
-- ADITIVA sobre a 0030: acrescenta 4 colunas NULAVEIS em group_messages e amplia 2 CHECKs (gatilho P1..P5 e classe 'plataforma'). Nao toca affiliate_offers, price_* nem master_products.
-- Sem este arquivo aplicado o codigo funciona igual; apenas deixa de gravar o horario planejado (modo sombra) e o resultado da
-- reconferencia ao vivo na linha (groupMessagesOnda2Ready() = false). O horario da fila no admin e calculado em memoria.
-- Rollback: 0031_group_messages_onda2.rollback.sql.

SET LOCAL lock_timeout = '5s';

ALTER TABLE group_messages
  ADD COLUMN IF NOT EXISTS planned_at       timestamptz,  -- modo sombra: horario planejado de saida da decisao simulada
  ADD COLUMN IF NOT EXISTS live_checked_at  timestamptz,  -- quando a reconferencia AO VIVO (API oficial) foi feita antes do envio
  ADD COLUMN IF NOT EXISTS live_price_cents bigint,       -- preco vivo da oferta principal na reconferencia
  ADD COLUMN IF NOT EXISTS live_note        text;         -- motivo da expiracao ou resumo por oferta (ok | sem estoque | rede | divergiu)

-- Classe PLATAFORMA (P1 a P5): amplia os CHECKs de gatilho e de classe criados na 0030.
ALTER TABLE group_messages DROP CONSTRAINT IF EXISTS group_messages_trigger_chk;
ALTER TABLE group_messages ADD CONSTRAINT group_messages_trigger_chk
  CHECK (trigger IN ('G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'OK1', 'OK2', 'T1', 'T2', 'RADAR', 'CUPOM', 'P1', 'P2', 'P3', 'P4', 'P5'));

ALTER TABLE group_messages DROP CONSTRAINT IF EXISTS group_messages_class_chk;
ALTER TABLE group_messages ADD CONSTRAINT group_messages_class_chk
  CHECK (msg_class IS NULL OR msg_class IN ('alerta', 'radar', 'insight', 'resumo', 'cupom', 'plataforma'));

-- A fila automatica ordena por criacao entre as linhas que ainda podem sair (indice parcial ja existe na 0030: group_messages_auto_idx).
