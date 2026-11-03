-- Rollback da 0020_search_products_trgm.sql. A busca (search-products.ts) detecta a ausencia da
-- funcao via to_regprocedure e volta ao SQL inline automaticamente.
DROP INDEX IF EXISTS public.master_products_search_norm_trgm_idx;
DROP FUNCTION IF EXISTS public.egeek_search_norm(text);
