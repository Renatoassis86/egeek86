-- Rollback da 0040: remove somente a tabela de historico do inventario (nenhum dado de catalogo/oferta/cotacao e tocado).
DROP TABLE IF EXISTS catalog_inventory_snapshots;
