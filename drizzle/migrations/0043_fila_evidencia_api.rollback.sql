-- Rollback da 0043: remove so as colunas/indice de evidencia. Decisoes ja aplicadas pela API ('api_oficial') continuam validas e desfaziveis
-- pelo painel (undoInTx nao usa estas colunas); a evidencia guardada se perde.
DROP INDEX IF EXISTS identity_review_items_api_todo_idx;
ALTER TABLE identity_review_items DROP COLUMN IF EXISTS api_evidence;
ALTER TABLE identity_review_items DROP COLUMN IF EXISTS api_checked_at;
ALTER TABLE identity_decisions    DROP COLUMN IF EXISTS decided_via;
