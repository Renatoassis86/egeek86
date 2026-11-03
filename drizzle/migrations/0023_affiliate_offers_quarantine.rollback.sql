-- Rollback da 0023. Remove so a marcacao; nenhuma oferta ou cotacao e afetada.
DROP INDEX IF EXISTS "affiliate_offers_quarantined_idx";
ALTER TABLE "affiliate_offers" DROP COLUMN IF EXISTS "quarantined_at";
