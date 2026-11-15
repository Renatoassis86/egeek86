-- 0059 (#119): indice parcial que acelera o pre-filtro da fila de group_messages (NOT EXISTS por master entre as ja enviadas). Mede-se 19 s -> ver docs. ADITIVA e idempotente; nenhum dado muda.
CREATE INDEX IF NOT EXISTS group_messages_enviadas_master_idx ON group_messages (master_product_id) INCLUDE (trigger, sent_at, created_at) WHERE channel = 'tg' AND status IN ('enviada', 'enviando');
