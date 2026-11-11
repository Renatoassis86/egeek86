-- Rollback da 0035. ATENCAO: apaga os codigos cadastrados pelo dono (source_kind = 'manual_dono') e suas leituras (ON DELETE CASCADE),
-- porque o CHECK antigo nao os aceita. Antes, se quiser guardar: pg_dump -t coupon_items -t coupon_reads.
SET LOCAL lock_timeout = '5s';
DELETE FROM coupon_items WHERE source_kind = 'manual_dono';
ALTER TABLE coupon_items DROP CONSTRAINT IF EXISTS coupon_items_srckind_chk;
ALTER TABLE coupon_items ADD CONSTRAINT coupon_items_srckind_chk CHECK (source_kind IN ('portal_listagem', 'pagina_do_item', 'api'));
