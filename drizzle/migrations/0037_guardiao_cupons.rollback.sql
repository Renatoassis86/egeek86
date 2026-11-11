-- Desfaz a 0037 (so as duas tabelas novas).
SET LOCAL lock_timeout = '5s';
DROP TABLE IF EXISTS coupon_consults;
DROP TABLE IF EXISTS coupon_announcements;
