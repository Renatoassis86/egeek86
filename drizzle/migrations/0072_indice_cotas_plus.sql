-- 0072 R-111: indice parcial para a leitura da cota do conjunto Plus (plusCallsUsed: soma de apiCalls de collect-vertical:* e semear-vertical:* em 24 h).
-- Antes: varria as ~9.000 linhas de collector_runs das ultimas 24 h pelo indice de data para guardar ~500 (22 chamadas/h, 1,9 s medio sob carga).
-- Agora: o indice parcial so tem essas ~500 linhas. ADITIVA (so um indice; nenhum dado muda). Aplicar CONCURRENTLY, fora de transacao:
--   npx tsx --env-file=.env.local scripts/criar-indices-io.ts --apply      (o script ja traz este indice)
-- Rollback: 0072_indice_cotas_plus.rollback.sql (DROP INDEX CONCURRENTLY IF EXISTS).
CREATE INDEX CONCURRENTLY IF NOT EXISTS collector_runs_plus_calls_idx ON collector_runs (started_at DESC)
  WHERE job LIKE 'collect-vertical:%' OR job LIKE 'semear-vertical:%';
