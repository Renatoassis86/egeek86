-- Vertical 'brinquedos' (2026-11-20; dono: "Vamos criar no Telegram a loja Brinquedos e Colecionaveis"). R-105.
-- NAO registrada em meta/_journal.json de proposito (mesmo padrao da 0033 e da 0066). Aplicar com scripts/apply-brinquedos.ts.
-- ADITIVA: PRESERVA as 8 verticais atuais e acrescenta 'brinquedos' nos 3 CHECKs (master_products, affiliate_offers, store_section_verticals).
-- Nenhuma linha e movida. A loja nasce em 'aguardando_canal' (SEM chat: o canal do Telegram ainda nao existe) e a vertical segue DESLIGADA (VERTICAL_BRINQUEDOS_ENABLED ausente).
-- master_products_vertical_type_chk (vertical <> 'games' => product_type <> 'game') ja cobre a vertical nova.
-- Rollback: 0070_vertical_brinquedos.rollback.sql (aborta se existir linha na vertical nova).
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE master_products ADD CONSTRAINT master_products_vertical_chk_new
  CHECK (vertical IN ('games','tecnologia','eletroeletronicos','livros','eletrodomesticos','esporte','impressao3d','beleza','brinquedos')) NOT VALID;
ALTER TABLE master_products VALIDATE CONSTRAINT master_products_vertical_chk_new;
ALTER TABLE master_products DROP CONSTRAINT master_products_vertical_chk;
ALTER TABLE master_products RENAME CONSTRAINT master_products_vertical_chk_new TO master_products_vertical_chk;

ALTER TABLE affiliate_offers ADD CONSTRAINT affiliate_offers_vertical_chk_new
  CHECK (vertical IN ('games','tecnologia','eletroeletronicos','livros','eletrodomesticos','esporte','impressao3d','beleza','brinquedos')) NOT VALID;
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
  CHECK (vertical IN ('games','tecnologia','eletroeletronicos','livros','eletrodomesticos','esporte','impressao3d','beleza','brinquedos'));

INSERT INTO store_sections (slug, name, stage, telegram_chat_id, limits, brand)
VALUES ('brinquedos', 'Brinquedos e Colecionáveis', 'aguardando_canal', NULL, '{}'::jsonb, '{"label":"Brinquedos e Colecionáveis"}'::jsonb)
ON CONFLICT (slug) DO NOTHING;
INSERT INTO store_section_verticals (vertical, store_id) SELECT 'brinquedos', id FROM store_sections WHERE slug = 'brinquedos' ON CONFLICT (vertical) DO NOTHING;
