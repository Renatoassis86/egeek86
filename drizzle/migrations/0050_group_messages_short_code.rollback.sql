-- Rollback da 0050: remove o indice e a coluna do codigo curto. Links /g/<codigo> ja publicados no WhatsApp passam a dar 404 (os textos novos voltam ao link longo).
SET LOCAL lock_timeout = '5s';
DROP INDEX IF EXISTS group_messages_short_code_uq;
ALTER TABLE group_messages DROP COLUMN IF EXISTS short_code;
