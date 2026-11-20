-- Rollback da 0070: restaura a lista de verticais anterior (sem brinquedos).
-- TRAVA: se existir master/oferta em 'brinquedos', ABORTA (reclassificar ou arquivar antes; nunca apagar).
SET LOCAL lock_timeout = '5s';
DO $$
DECLARE n_m bigint; n_o bigint;
BEGIN
  SELECT count(*) INTO n_m FROM master_products WHERE vertical = 'brinquedos';
  SELECT count(*) INTO n_o FROM affiliate_offers WHERE vertical = 'brinquedos';
  IF n_m > 0 OR n_o > 0 THEN RAISE EXCEPTION 'Rollback 0070 abortado: % masters e % ofertas em brinquedos. Tratar antes.', n_m, n_o; END IF;
END $$;
DELETE FROM store_section_verticals WHERE vertical = 'brinquedos';
DELETE FROM store_sections WHERE slug = 'brinquedos' AND telegram_chat_id IS NULL;
ALTER TABLE master_products ADD CONSTRAINT master_products_vertical_chk_old
  CHECK (vertical IN ('games','tecnologia','eletroeletronicos','livros','eletrodomesticos','esporte','impressao3d','beleza')) NOT VALID;
ALTER TABLE master_products VALIDATE CONSTRAINT master_products_vertical_chk_old;
ALTER TABLE master_products DROP CONSTRAINT master_products_vertical_chk;
ALTER TABLE master_products RENAME CONSTRAINT master_products_vertical_chk_old TO master_products_vertical_chk;
ALTER TABLE affiliate_offers ADD CONSTRAINT affiliate_offers_vertical_chk_old
  CHECK (vertical IN ('games','tecnologia','eletroeletronicos','livros','eletrodomesticos','esporte','impressao3d','beleza')) NOT VALID;
ALTER TABLE affiliate_offers VALIDATE CONSTRAINT affiliate_offers_vertical_chk_old;
ALTER TABLE affiliate_offers DROP CONSTRAINT affiliate_offers_vertical_chk;
ALTER TABLE affiliate_offers RENAME CONSTRAINT affiliate_offers_vertical_chk_old TO affiliate_offers_vertical_chk;
ALTER TABLE store_section_verticals DROP CONSTRAINT store_section_verticals_vertical_check;
ALTER TABLE store_section_verticals ADD CONSTRAINT store_section_verticals_vertical_check
  CHECK (vertical IN ('games','tecnologia','eletroeletronicos','livros','eletrodomesticos','esporte','impressao3d','beleza'));
