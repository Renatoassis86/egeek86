-- Rollback da 0068: remove so as 3 tabelas de resumo (derivadas; as cotacoes nao sao tocadas). Antes: PRICE_STATS_ROLLUP=off.
DROP TABLE IF EXISTS product_price_rollup;
DROP TABLE IF EXISTS product_price_rollup_state;
DROP TABLE IF EXISTS product_price_rollup_meta;
