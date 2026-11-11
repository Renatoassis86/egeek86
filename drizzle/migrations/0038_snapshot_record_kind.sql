-- 0038: tipo de registro da cotacao (dono, 2026-11-11): 'primeira' (1a cotacao da oferta), 'mudanca' (preco diferente da cotacao anterior),
-- 'batimento' (mesmo preco, gravado a cada 24 h so para provar que a coleta segue viva), 'manual' (cadastro no admin).
-- Aditiva e reversivel (rollback). O backfill das linhas antigas roda em lotes pelo scripts/apply-tipo-registro.ts.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
ALTER TABLE affiliate_price_snapshots ADD COLUMN IF NOT EXISTS record_kind text;
ALTER TABLE affiliate_price_snapshots DROP CONSTRAINT IF EXISTS affiliate_price_snapshots_kind_chk;
ALTER TABLE affiliate_price_snapshots ADD CONSTRAINT affiliate_price_snapshots_kind_chk
  CHECK (record_kind IS NULL OR record_kind IN ('primeira','mudanca','batimento','manual')) NOT VALID;
