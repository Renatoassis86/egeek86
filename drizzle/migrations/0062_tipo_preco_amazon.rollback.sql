-- Rollback da 0062: remove as colunas de tipo de preco. Restaure ANTES os precos das cotacoes corrigidas (scripts/corrigir-tipo-preco-amazon-124.ts --rollback), senao o preco Pix original (pix_cents) se perde.
SET LOCAL lock_timeout = '5s';
ALTER TABLE affiliate_price_snapshots DROP COLUMN IF EXISTS price_type;
ALTER TABLE affiliate_price_snapshots DROP COLUMN IF EXISTS pix_cents;
ALTER TABLE affiliate_offers DROP COLUMN IF EXISTS pix_cents;
ALTER TABLE affiliate_offers DROP COLUMN IF EXISTS pix_visto_em;
