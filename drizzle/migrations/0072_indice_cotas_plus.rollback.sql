-- Rollback da 0072: remove o indice parcial (a consulta volta ao indice de data, mais lenta, mesmo resultado).
DROP INDEX CONCURRENTLY IF EXISTS collector_runs_plus_calls_idx;
