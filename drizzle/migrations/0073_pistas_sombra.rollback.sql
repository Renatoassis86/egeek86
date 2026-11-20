-- Rollback da 0073: remove as tabelas da sombra e a coluna tipo (a coluna e derivada de candidate->>'tipo'; nada se perde).
SET LOCAL lock_timeout = '3s';
DROP TABLE IF EXISTS pista_decisao;
DROP TABLE IF EXISTS pista_contador;
DROP INDEX IF EXISTS group_messages_vertical_tipo_idx;
ALTER TABLE group_messages DROP COLUMN IF EXISTS tipo;
