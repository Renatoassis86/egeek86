-- 0043: EVIDENCIA DA API OFICIAL na fila de classificacao (R4 da ata 2026-11-11-time-identidade-itens; dono autorizou a consulta em 2026-11-11).
-- PROPOSTA: NAO aplicada, NAO registrada em meta/_journal.json (como 0019-0042). ADITIVA: so adiciona colunas anulaveis em tabelas da fila;
-- nenhuma oferta, master, cotacao ou mensagem e tocado. Depende da 0042. Rollback: 0043_fila_evidencia_api.rollback.sql.
-- Aplicar (apenas o dono): npx tsx --env-file=.env.local scripts/apply-fila-evidencia-api.ts --apply (rodar a 0043 no mesmo molde da 0042).
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE identity_review_items ADD COLUMN IF NOT EXISTS api_evidence   jsonb;        -- resposta resumida da API oficial da loja (so campos usados)
ALTER TABLE identity_review_items ADD COLUMN IF NOT EXISTS api_checked_at timestamptz;  -- quando foi consultada (NULL = nunca)
ALTER TABLE identity_decisions    ADD COLUMN IF NOT EXISTS decided_via    text;         -- NULL = dono/regra; 'api_oficial' = aplicada pela prova da API

-- Itens ainda nao consultados (a selecao do cron varre so isto, mais os consultados ha mais de 7 dias).
CREATE INDEX IF NOT EXISTS identity_review_items_api_todo_idx ON identity_review_items (created_at) WHERE status = 'pending' AND api_checked_at IS NULL;
