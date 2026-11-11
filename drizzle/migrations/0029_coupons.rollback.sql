-- Rollback da 0029. Remove SO as tabelas novas de cupons lidos (coupon_reads primeiro, por causa da FK).
-- Nao toca em `coupons`, `affiliate_coupons`, ofertas, cotacoes ou produtos. Antes: parar a varredura (remover ASSISTED_INGEST_TOKEN
-- e AMAZON_INGEST_TOKEN faz a rota /api/ingest/cupons responder 503) e, se quiser guardar o historico, pg_dump -t coupon_items -t coupon_reads.
-- Sem as tabelas, findVerifiedCoupons devolve lista vazia (erro tratado) e a mensagem sai sem cupom.
SET LOCAL lock_timeout = '5s';
DROP TABLE IF EXISTS coupon_reads;
DROP TABLE IF EXISTS coupon_items;
