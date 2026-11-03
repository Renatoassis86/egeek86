-- Rollback da 0022_snapshots_precalculados.sql. As tabelas sao derivadas (recalculaveis pelo cron);
-- nenhuma oferta, cotacao ou produto e tocado. As telas voltam sozinhas ao calculo ao vivo.
DROP TABLE IF EXISTS product_price_stats;
DROP TABLE IF EXISTS showcase_snapshot;
