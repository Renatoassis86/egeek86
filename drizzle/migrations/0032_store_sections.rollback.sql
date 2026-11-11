-- Rollback da 0032. Sem perda de dado de negocio: store_id e DERIVADO de group_messages.vertical; historico de mensagens,
-- precos e produtos nao mudam. As tabelas de loja (config/seed) sao descartadas; refazer = reaplicar a 0032.
SET LOCAL lock_timeout = '5s';

DROP INDEX IF EXISTS group_messages_store_idx;
ALTER TABLE group_messages DROP COLUMN IF EXISTS store_id;
DROP TABLE IF EXISTS telegram_chat_discoveries;
DROP TABLE IF EXISTS store_section_verticals;
DROP TABLE IF EXISTS store_sections;
