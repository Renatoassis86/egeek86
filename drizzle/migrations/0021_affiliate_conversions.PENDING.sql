-- PENDENTE: NAO APLICADA e FORA do journal (drizzle/migrations/meta/_journal.json).
-- Rollback: 0021_affiliate_conversions.rollback.sql. Aplicar so apos revisao do dono.
-- Ao aplicar: renomear para 0021_affiliate_conversions.sql e registrar no journal
-- (ou gerar via drizzle-kit se o schema Drizzle for criado depois).
--
-- Conversoes de afiliado (Shopee API / CSV do painel do Mercado Livre).
-- Idempotencia: UNIQUE (source, external_id).
-- Atribuicao: offer_id / master_product_id ficam NULL quando o dado nao traz o item.

CREATE TABLE IF NOT EXISTS "affiliate_conversions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "source" text NOT NULL CHECK ("source" IN ('shopee_api', 'ml_csv')),
  "network_slug" text NOT NULL,
  "external_id" text NOT NULL,
  "order_id" text,
  "order_status" text NOT NULL DEFAULT 'unknown'
    CHECK ("order_status" IN ('pending', 'completed', 'cancelled', 'refunded', 'unpaid', 'unknown')),
  "raw_status" text,
  "click_at" timestamptz,
  "purchase_at" timestamptz,
  "item_ref" text,
  "item_name" text,
  "quantity" integer,
  "item_price_cents" integer,
  "commission_cents" integer,
  "net_commission_cents" integer,
  "refund_cents" integer,
  "sub_id" text,
  "attribution_type" text,
  "offer_id" uuid REFERENCES "affiliate_offers"("id") ON DELETE SET NULL,
  "master_product_id" uuid REFERENCES "master_products"("id") ON DELETE SET NULL,
  "attribution_method" text NOT NULL DEFAULT 'none' CHECK ("attribution_method" IN ('item_ref', 'none')),
  "import_batch" text,
  "raw" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "imported_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "affiliate_conversions_source_ext_uq" UNIQUE ("source", "external_id")
);

CREATE INDEX IF NOT EXISTS "affiliate_conversions_purchase_idx" ON "affiliate_conversions" ("purchase_at");
CREATE INDEX IF NOT EXISTS "affiliate_conversions_master_idx" ON "affiliate_conversions" ("master_product_id") WHERE "master_product_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "affiliate_conversions_offer_idx" ON "affiliate_conversions" ("offer_id") WHERE "offer_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "affiliate_conversions_network_status_idx" ON "affiliate_conversions" ("network_slug", "order_status");

-- Mesmo padrao da 0019: RLS ligado, sem policies, sem acesso de anon/authenticated.
ALTER TABLE "affiliate_conversions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "affiliate_conversions" FROM anon, authenticated;
