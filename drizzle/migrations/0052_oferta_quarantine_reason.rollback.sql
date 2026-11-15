-- Rollback da 0052: remove a coluna do motivo. Nenhuma oferta/cotacao e tocada (quarantined_at continua). Desligue QUARENTENA_PRECO_TIPO antes.
SET LOCAL lock_timeout = '5s';
ALTER TABLE affiliate_offers DROP COLUMN IF EXISTS quarantine_reason;
