-- Rollback da 0063: remove o trigger, as funcoes e as duas tabelas. Nenhuma coluna de affiliate_offers e tocada; o estado
-- affiliate_link_pending ja gravado permanece (reverter dados: use o backup NDJSON de docs/backups/link-afiliado-backfill-*.ndjson).
SET LOCAL lock_timeout = '5s';
DROP TRIGGER IF EXISTS affiliate_offers_link_trg ON affiliate_offers;
DROP FUNCTION IF EXISTS affiliate_offers_link_trg();
DROP FUNCTION IF EXISTS affiliate_link_normalizar(text, text);
DROP FUNCTION IF EXISTS affiliate_link_valido(text, text);
DROP FUNCTION IF EXISTS affiliate_link_cfg(text);
DROP TABLE IF EXISTS link_afiliado_bloqueios;
DROP TABLE IF EXISTS affiliate_link_config;
