-- 0050: LINK CURTO DO WHATSAPP (dono, 2026-11-12: "encurtar o link do WhatsApp"). egeek86.com/g/<5 caracteres base62> -> mesmo link rastreado do canal 'wa'.
-- ADITIVA: uma coluna anulavel, sem DEFAULT; linhas antigas ficam NULL (a rota /g devolve 404 para elas; o texto delas ja tem o link longo).
-- NAO registrada em meta/_journal.json (como 0019-0049). Aplicada por scripts/apply-short-code.ts (backup do estado antes; o indice vai em
-- transacao separada porque CREATE INDEX CONCURRENTLY nao roda dentro de transacao: 0050_group_messages_short_code_idx.sql).
-- Rollback: 0050_group_messages_short_code.rollback.sql. O codigo tolera a coluna ausente (groupMessagesShortCodeReady): sem ela o WhatsApp segue com o link longo.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE group_messages ADD COLUMN IF NOT EXISTS short_code text;
