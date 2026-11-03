-- Quarentena de oferta com preco absurdo (decisao adotada por delegacao em 2026-11-03, reversivel).
-- Aditiva: coluna NULL = oferta normal; preenchida = fora de TODA leitura publica e indicador.
-- A oferta e suas cotacoes NUNCA sao apagadas. Reversao: ver 0023_affiliate_offers_quarantine.rollback.sql
-- (ou apenas `UPDATE affiliate_offers SET quarantined_at = NULL` pelo script scripts/quarentena-precos-absurdos.ts --revert).
ALTER TABLE "affiliate_offers" ADD COLUMN IF NOT EXISTS "quarantined_at" timestamp with time zone;
CREATE INDEX IF NOT EXISTS "affiliate_offers_quarantined_idx" ON "affiliate_offers" ("quarantined_at") WHERE "quarantined_at" IS NOT NULL;
