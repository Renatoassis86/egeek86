-- Gatilho ACHADO (2026-11-12; ata docs/conselho/atas/2026-11-12-diversidade-fluxo-plus.md). PROPOSTA: NAO aplicada, NAO registrada em
-- meta/_journal.json de proposito (como 0019-0031). Aplicar so com aprovacao do dono, com backup antes (pg_dump -t group_messages).
-- ADITIVA: apenas amplia o CHECK de gatilho para aceitar 'AC'. Nao toca affiliate_offers, price_* nem master_products. A classe do Achado
-- e 'insight' (ja aceita pelo CHECK de classe da 0031).
-- Enquanto nao for aplicada, o codigo deixa o Achado DESLIGADO (groupMessagesAchadoReady() = false: o CHECK nao inclui 'AC').
-- Rollback: 0046_group_messages_achado.rollback.sql (apaga ou arquiva antes as linhas com trigger = 'AC').

SET LOCAL lock_timeout = '5s';

ALTER TABLE group_messages DROP CONSTRAINT IF EXISTS group_messages_trigger_chk;
ALTER TABLE group_messages ADD CONSTRAINT group_messages_trigger_chk
  CHECK (trigger IN ('G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'OK1', 'OK2', 'T1', 'T2', 'RADAR', 'CUPOM', 'P1', 'P2', 'P3', 'P4', 'P5', 'AC'));
