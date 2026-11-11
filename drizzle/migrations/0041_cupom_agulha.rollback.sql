-- Desfaz 0041_cupom_agulha: remove o indice e a coluna miss_reason (so dado de auditoria; nada mais e tocado).
SET LOCAL lock_timeout = '5s';
DROP INDEX IF EXISTS coupon_consults_miss_idx;
ALTER TABLE coupon_consults DROP COLUMN IF EXISTS miss_reason;
