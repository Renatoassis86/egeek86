-- Rollback da 0021_affiliate_conversions.PENDING.sql. Apaga os dados importados (reimportaveis dos relatorios).
DROP TABLE IF EXISTS "affiliate_conversions";
