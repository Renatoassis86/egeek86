-- Codigo de campanha cadastrado pelo dono (2026-11-11). PROPOSTA: NAO aplicada, NAO registrada em meta/_journal.json.
-- Requer a 0029 (coupon_items) ja aplicada. ADITIVA: so AMPLIA o CHECK de source_kind para aceitar 'manual_dono'
-- (linhas existentes continuam validas). Rollback: 0035_coupon_manual_dono.rollback.sql.
SET LOCAL lock_timeout = '5s';
ALTER TABLE coupon_items DROP CONSTRAINT IF EXISTS coupon_items_srckind_chk;
ALTER TABLE coupon_items ADD CONSTRAINT coupon_items_srckind_chk CHECK (source_kind IN ('portal_listagem', 'pagina_do_item', 'api', 'manual_dono'));
