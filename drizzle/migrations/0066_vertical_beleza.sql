-- Vertical 'beleza' (2026-11-17; dono: "nao estou vendo produtos de beleza, principalmente maquiagens, de preferencia das melhores marcas").
-- NAO registrada em meta/_journal.json de proposito (mesmo padrao da 0033). Aplicar com scripts/apply-beleza.ts.
-- ADITIVA: PRESERVA as 7 verticais atuais e acrescenta 'beleza' nos 3 CHECKs (master_products, affiliate_offers, store_section_verticals).
-- Nenhuma linha e movida. master_products_vertical_type_chk (vertical <> 'games' => product_type <> 'game') ja cobre a vertical nova.
-- Rollback: 0066_vertical_beleza.rollback.sql (aborta se existir linha na vertical nova).
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE master_products ADD CONSTRAINT master_products_vertical_chk_new
  CHECK (vertical IN ('games','tecnologia','eletroeletronicos','livros','eletrodomesticos','esporte','impressao3d','beleza')) NOT VALID;
ALTER TABLE master_products VALIDATE CONSTRAINT master_products_vertical_chk_new;
ALTER TABLE master_products DROP CONSTRAINT master_products_vertical_chk;
ALTER TABLE master_products RENAME CONSTRAINT master_products_vertical_chk_new TO master_products_vertical_chk;

ALTER TABLE affiliate_offers ADD CONSTRAINT affiliate_offers_vertical_chk_new
  CHECK (vertical IN ('games','tecnologia','eletroeletronicos','livros','eletrodomesticos','esporte','impressao3d','beleza')) NOT VALID;
ALTER TABLE affiliate_offers VALIDATE CONSTRAINT affiliate_offers_vertical_chk_new;
ALTER TABLE affiliate_offers DROP CONSTRAINT affiliate_offers_vertical_chk;
ALTER TABLE affiliate_offers RENAME CONSTRAINT affiliate_offers_vertical_chk_new TO affiliate_offers_vertical_chk;

DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c FROM pg_constraint WHERE conrelid = 'store_section_verticals'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%impressao3d%' LIMIT 1;
  IF c IS NOT NULL THEN EXECUTE format('ALTER TABLE store_section_verticals DROP CONSTRAINT %I', c); END IF;
END $$;
ALTER TABLE store_section_verticals ADD CONSTRAINT store_section_verticals_vertical_check
  CHECK (vertical IN ('games','tecnologia','eletroeletronicos','livros','eletrodomesticos','esporte','impressao3d','beleza'));

INSERT INTO store_sections (slug, name, stage, telegram_chat_id, telegram_chat_title, telegram_verified_at, telegram_bot_can_post, limits, brand)
VALUES ('beleza', 'Beleza', 'canal_verificado', '-1004458480627', 'Espaço Geek 86 · Beleza', now(), true, '{}'::jsonb, '{"label":"Beleza"}'::jsonb)
ON CONFLICT (slug) DO NOTHING;
INSERT INTO store_section_verticals (vertical, store_id) SELECT 'beleza', id FROM store_sections WHERE slug = 'beleza' ON CONFLICT (vertical) DO NOTHING;
