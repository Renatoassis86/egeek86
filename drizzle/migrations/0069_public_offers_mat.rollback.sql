-- Rollback da 0069: remove as tabelas derivadas de ofertas publicas materializadas (recriaveis pelo cron). A leitura volta sozinha a CTE
-- (a mesma guarda de prontidao ja ignora a tabela quando ela nao existe/esta velha; ou PUBLIC_OFFERS_MAT=off).
SET LOCAL lock_timeout = '5s';
DROP TABLE IF EXISTS public_offers_mat_meta;
DROP TABLE IF EXISTS public_offers_mat;
