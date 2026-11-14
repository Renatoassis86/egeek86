-- Gatilho N1 'Preço agora' (2026-11-13; decisão do dono: produto SEM base de preço pode ir em mensagem NEUTRA). PROPOSTA: NAO aplicada,
-- NAO registrada em meta/_journal.json de proposito (como 0046). Aplicar so com aprovacao do dono, com backup antes (pg_dump -t group_messages).
-- ADITIVA: apenas amplia o CHECK de gatilho para aceitar 'N1'. Nao toca affiliate_offers, price_* nem master_products. A classe do N1 e
-- 'insight' (ja aceita pelo CHECK de classe da 0031).
-- Enquanto nao for aplicada, o codigo deixa o N1 DESLIGADO (groupMessagesNeutroReady() = false: o CHECK nao inclui 'N1'), mesmo com a flag
-- GROUP_NEUTRO_SEM_BASE=on. Rollback: 0051_group_messages_n1.rollback.sql (apague ou arquive antes as linhas com trigger = 'N1').

SET LOCAL lock_timeout = '5s';

ALTER TABLE group_messages DROP CONSTRAINT IF EXISTS group_messages_trigger_chk;
ALTER TABLE group_messages ADD CONSTRAINT group_messages_trigger_chk
  CHECK (trigger IN ('G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'OK1', 'OK2', 'T1', 'T2', 'RADAR', 'CUPOM', 'P1', 'P2', 'P3', 'P4', 'P5', 'AC', 'N1'));
