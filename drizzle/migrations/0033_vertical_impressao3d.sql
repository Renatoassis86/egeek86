-- Vertical 'impressao3d' (2026-11-11). Plano: docs/plano-lojas-secoes-canais-2026-11-11.md (secao 1.5, Parte II A1).
-- NAO registrada em meta/_journal.json de proposito. Aplicar com scripts/apply-lojas.ts.
-- ADITIVA: PRESERVA todas as verticais atuais (games, tecnologia, eletroeletronicos, livros, eletrodomesticos, esporte) e acrescenta
-- impressao3d nos CHECKs master_products_vertical_chk e affiliate_offers_vertical_chk. Nenhuma linha e movida: os masters de
-- impressora 3D que hoje estao em 'tecnologia' continuam la (reclassificacao e decisao posterior, com lista revista pelo dono).
-- master_products_vertical_type_chk (vertical <> 'games' => product_type <> 'game') ja cobre a vertical nova.
-- Padrao: ADD novo CHECK NOT VALID -> VALIDATE -> DROP antigo -> RENAME.
-- Rollback: 0033_vertical_impressao3d.rollback.sql (aborta se existir linha na vertical nova).

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE master_products ADD CONSTRAINT master_products_vertical_chk_new
  CHECK (vertical IN ('games','tecnologia','eletroeletronicos','livros','eletrodomesticos','esporte','impressao3d')) NOT VALID;
ALTER TABLE master_products VALIDATE CONSTRAINT master_products_vertical_chk_new;
ALTER TABLE master_products DROP CONSTRAINT master_products_vertical_chk;
ALTER TABLE master_products RENAME CONSTRAINT master_products_vertical_chk_new TO master_products_vertical_chk;

ALTER TABLE affiliate_offers ADD CONSTRAINT affiliate_offers_vertical_chk_new
  CHECK (vertical IN ('games','tecnologia','eletroeletronicos','livros','eletrodomesticos','esporte','impressao3d')) NOT VALID;
ALTER TABLE affiliate_offers VALIDATE CONSTRAINT affiliate_offers_vertical_chk_new;
ALTER TABLE affiliate_offers DROP CONSTRAINT affiliate_offers_vertical_chk;
ALTER TABLE affiliate_offers RENAME CONSTRAINT affiliate_offers_vertical_chk_new TO affiliate_offers_vertical_chk;
