-- Rollback da 0044: remove indice e colunas. As ofertas marcadas voltam a contar na media (a flag some); nenhuma oferta/cotacao e tocada.
-- Se eligibleOfferSql ja referencia avg_excluded_at, reverta essa linha ANTES de rodar este arquivo.
SET LOCAL lock_timeout = '5s';
DROP INDEX IF EXISTS affiliate_offers_avg_excluded_idx;
ALTER TABLE affiliate_offers DROP COLUMN IF EXISTS avg_excluded_reason;
ALTER TABLE affiliate_offers DROP COLUMN IF EXISTS avg_excluded_at;
