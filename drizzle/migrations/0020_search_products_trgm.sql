-- Busca de produtos (src/server/queries/search-products.ts) - NAO APLICADA.
-- Opcional: a busca funciona sem esta migration (varredura sequencial em ~4,7 mil
-- masters = poucos ms). Aplicar so quando o catalogo crescer. Idempotente.
-- Nao registrada em meta/_journal.json de proposito (aplicar manualmente/por revisao do dono).
-- Extensoes pg_trgm e unaccent ja existem no banco (schema public).

-- Normalizacao igual a inline do motor: sem acento, minuscula, sem apostrofo,
-- pontuacao vira espaco, "fc25" vira "fc 25". IMMUTABLE porque unaccent recebe o
-- dicionario explicito (necessario para indexar a expressao).
CREATE OR REPLACE FUNCTION public.egeek_search_norm(t text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT btrim(
    regexp_replace(
      regexp_replace(
        regexp_replace(lower(public.unaccent('public.unaccent'::regdictionary, t)), '[''’`´]', '', 'g'),
        '[^a-z0-9]+', ' ', 'g'),
      '([a-z])([0-9])', '\1 \2', 'g')
  )
$$;

-- Acelera LIKE '%palavra%' e word_similarity/similarity sobre o nome normalizado.
CREATE INDEX IF NOT EXISTS master_products_search_norm_trgm_idx
  ON public.master_products USING gin (public.egeek_search_norm(name) public.gin_trgm_ops)
  WHERE NOT (attributes ? 'mergedInto');
