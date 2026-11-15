-- 0052: MOTIVO DA QUARENTENA (dono, 2026-11-15, decisao 3: quarentena em lote de preco implausivel e titulo de risco).
-- Aplicada com backup do esquema (scripts/aplicar-migration-0052.ts), fora do journal do Drizzle (molde 0044-0048). ADITIVA: uma coluna anulavel, sem DEFAULT (metadado).
-- NULL = quarentena antiga (sem motivo gravado) ou oferta fora de quarentena. O schema Drizzle NAO ganhou a coluna de proposito (so SQL cru a le/grava).
-- Rollback: 0052_oferta_quarantine_reason.rollback.sql.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE affiliate_offers ADD COLUMN IF NOT EXISTS quarantine_reason text;
