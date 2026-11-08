-- Rollback da 0027. Remove indices, CHECKs e a coluna `vertical`. O valor 'general' de product_type FICA (inerte; Postgres nao remove
-- valor de enum).
-- TRAVA DE SEGURANCA: se ja existir master/oferta com vertical <> 'games', dropar a coluna faria esses registros parecerem gamer
-- (vazariam nas superficies gamer). Nesse caso este rollback ABORTA; desligue o cron/flags da vertical e trate os registros antes
-- (mover para 'review'/arquivar por script proprio, nunca apagar snapshots).
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE n_m bigint; n_o bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'master_products'::regclass AND attname = 'vertical' AND NOT attisdropped) THEN
    EXECUTE 'SELECT count(*) FROM master_products WHERE vertical <> ''games''' INTO n_m;
    EXECUTE 'SELECT count(*) FROM affiliate_offers WHERE vertical <> ''games''' INTO n_o;
    IF n_m > 0 OR n_o > 0 THEN
      RAISE EXCEPTION 'Rollback 0027 abortado: % masters e % ofertas fora de games. Tratar antes de dropar a coluna.', n_m, n_o;
    END IF;
  END IF;
END $$;

DROP INDEX IF EXISTS affiliate_offers_vertical_status_idx;
DROP INDEX IF EXISTS master_products_vertical_idx;
ALTER TABLE master_products DROP CONSTRAINT IF EXISTS master_products_vertical_type_chk;
ALTER TABLE master_products DROP CONSTRAINT IF EXISTS master_products_vertical_chk;
ALTER TABLE affiliate_offers DROP CONSTRAINT IF EXISTS affiliate_offers_vertical_chk;
ALTER TABLE master_products DROP COLUMN IF EXISTS vertical;
ALTER TABLE affiliate_offers DROP COLUMN IF EXISTS vertical;
