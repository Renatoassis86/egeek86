-- 0050 (parte 2): indice unico parcial do codigo curto. Executar FORA de transacao (CONCURRENTLY).
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS group_messages_short_code_uq ON group_messages (short_code) WHERE short_code IS NOT NULL;
