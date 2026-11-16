-- 0062: TIPO DE PRECO DA AMAZON (dono, 2026-11-16; Fluxo Mestre R-69). ADITIVA: colunas nullable, nada existente e alterado.
-- price_cents da Amazon passa a ser SEMPRE o preco CHEIO; o preco "a vista no Pix" e atributo (pix_cents). price_type marca a cotacao ('cheio').
-- Fora do journal do Drizzle (molde 0044-0061). Rollback: 0062_tipo_preco_amazon.rollback.sql. Desligar sem rollback: AMAZON_TIPO_PRECO=off.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE affiliate_price_snapshots ADD COLUMN IF NOT EXISTS price_type text;
ALTER TABLE affiliate_price_snapshots ADD COLUMN IF NOT EXISTS pix_cents bigint;
ALTER TABLE affiliate_offers ADD COLUMN IF NOT EXISTS pix_cents bigint;
ALTER TABLE affiliate_offers ADD COLUMN IF NOT EXISTS pix_visto_em timestamptz;
