-- Rollback da 0028. Remove a tabela de mensagens para grupos (so propostas/historico de mensagens; nenhuma oferta, cotacao ou produto e tocado).
-- Antes: GROUP_MESSAGES_ENABLED desligado (ou removido). Com a flag ligada o cron tentaria gravar e falharia (erro tratado, nada e enviado).
-- Backup opcional antes: COPY group_messages TO ... ou pg_dump -t group_messages.
SET LOCAL lock_timeout = '5s';
DROP TABLE IF EXISTS group_messages;
