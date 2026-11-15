-- Rollback da 0057.
ALTER TABLE offer_link_audit DROP COLUMN IF EXISTS regra_versao;
