-- Rollback da 0060: remove a tabela de marcas (so o registro das marcas; nenhuma cotacao e tocada). Desligue GATILHO_PRECO_ISCA=0 e rode a varredura (libera as quarentenas preco_isca) ANTES.
SET LOCAL lock_timeout = '5s';
DROP TABLE IF EXISTS preco_isca_marcas;
