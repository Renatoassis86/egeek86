-- 0047: VARIACAO DE PRECO DA OFERTA SHOPEE (dono, 2026-11-12: nenhum item e recusado por variacao; entra com o menor preco, marcado).
-- PROPOSTA: NAO aplicada, NAO registrada em meta/_journal.json (como 0019-0046). ADITIVA: tres colunas anulaveis, sem DEFAULT (metadado).
-- NULL = preco unico / nao informado (nunca e tratado como zero). Fonte: SOMENTE priceMin/priceMax devolvidos pela API oficial de afiliados.
-- O schema Drizzle NAO ganhou as colunas de proposito (mesmo molde da 0044/0045); o codigo so grava com SHOPEE_VARIANTE_COLUNAS=1, depois de aplicada.
-- Enquanto nao aplicada, a marca fica em collector_runs.meta.variantes (job cobertura-shopee). Rollback: 0048_oferta_variacao_preco.rollback.sql.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE affiliate_offers ADD COLUMN IF NOT EXISTS variant_min_cents bigint;        -- menor preco entre variacoes (= preco "a partir de" da oferta)
ALTER TABLE affiliate_offers ADD COLUMN IF NOT EXISTS variant_max_cents bigint;        -- maior preco entre variacoes
ALTER TABLE affiliate_offers ADD COLUMN IF NOT EXISTS variant_spread    numeric(10,4); -- variant_max / variant_min; > 1.1 = faixa ampla ("a partir de")
