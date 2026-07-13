-- ============================================================
-- 0001_extras: ajustes que o Drizzle Kit não gera automaticamente
-- - Trigger universal de updated_at
-- - FK profiles.id → auth.users.id (Supabase)
-- - Generated columns (stocks.available, products.search_tsv)
-- - Índices FTS (GIN sobre tsvector) e trigram
-- ============================================================

-- ============================================================
-- 1. FK profiles → auth.users
-- ============================================================
ALTER TABLE "profiles"
  ADD CONSTRAINT "profiles_id_auth_users_fk"
  FOREIGN KEY ("id") REFERENCES auth.users(id) ON DELETE CASCADE;
--> statement-breakpoint

-- ============================================================
-- 2. Trigger universal de updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

-- Aplicar em todas as tabelas com coluna updated_at
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'updated_at'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at_trigger ON %I', t);
    EXECUTE format(
      'CREATE TRIGGER set_updated_at_trigger BEFORE UPDATE ON %I '
      'FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t);
  END LOOP;
END $$;
--> statement-breakpoint

-- ============================================================
-- 3. stocks.available = on_hand - reserved (GENERATED)
-- ============================================================
ALTER TABLE "stocks" DROP COLUMN IF EXISTS "available";
--> statement-breakpoint
ALTER TABLE "stocks"
  ADD COLUMN "available" INTEGER
  GENERATED ALWAYS AS ("on_hand" - "reserved") STORED;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stocks_available_positive_idx"
  ON "stocks" ("available") WHERE "available" > 0;
--> statement-breakpoint

-- ============================================================
-- 4. products.search_tsv (FTS) — gerado a partir de title/description
-- (NB: brand_name/franchise_name viriam de join; mantemos só do produto
--  no MVP; refresh via trigger se quiser pegar denormalização)
--
-- unaccent() e to_tsvector(regconfig, text) são STABLE, não IMMUTABLE —
-- Postgres exige IMMUTABLE em expressão de coluna GENERATED. Wrappers
-- abaixo são o workaround padrão (aceito na comunidade Postgres/Supabase
-- para FTS com dicionário/configuração fixos em produção).
-- ============================================================
CREATE OR REPLACE FUNCTION immutable_unaccent(text)
RETURNS text AS $$
  SELECT unaccent('unaccent', $1)
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION immutable_to_tsvector(regconfig, text)
RETURNS tsvector AS $$
  SELECT to_tsvector($1, $2)
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT;
--> statement-breakpoint

ALTER TABLE "products" DROP COLUMN IF EXISTS "search_tsv";
--> statement-breakpoint
ALTER TABLE "products"
  ADD COLUMN "search_tsv" TSVECTOR
  GENERATED ALWAYS AS (
    setweight(immutable_to_tsvector('portuguese', immutable_unaccent(coalesce("title", ''))), 'A') ||
    setweight(immutable_to_tsvector('portuguese', immutable_unaccent(coalesce("description", ''))), 'C') ||
    setweight(immutable_to_tsvector('portuguese', immutable_unaccent(coalesce("attributes"::text, ''))), 'D')
  ) STORED;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "products_search_gin"
  ON "products" USING GIN("search_tsv");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_title_trgm"
  ON "products" USING GIN("title" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_attributes_gin"
  ON "products" USING GIN("attributes" jsonb_path_ops);
--> statement-breakpoint

-- ============================================================
-- 5. CHECKs de invariantes essenciais
-- ============================================================
ALTER TABLE "stocks"
  ADD CONSTRAINT "stocks_on_hand_chk" CHECK ("on_hand" >= 0),
  ADD CONSTRAINT "stocks_reserved_chk" CHECK ("reserved" >= 0);
--> statement-breakpoint

ALTER TABLE "product_variants"
  ADD CONSTRAINT "variants_price_chk" CHECK ("price_cents" >= 0);
--> statement-breakpoint

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_total_chk" CHECK ("total_cents" >= 0);
--> statement-breakpoint

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_amount_chk" CHECK ("amount_cents" > 0);
--> statement-breakpoint

ALTER TABLE "refunds"
  ADD CONSTRAINT "refunds_amount_chk" CHECK ("amount_cents" > 0);
--> statement-breakpoint

ALTER TABLE "reservations"
  ADD CONSTRAINT "reservations_qty_chk" CHECK ("quantity" > 0);
--> statement-breakpoint

ALTER TABLE "cart_items"
  ADD CONSTRAINT "cart_items_qty_chk" CHECK ("quantity" > 0);
--> statement-breakpoint

ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_qty_chk" CHECK ("quantity" > 0);
--> statement-breakpoint

ALTER TABLE "drops"
  ADD CONSTRAINT "drops_stock_chk" CHECK ("stock_limit" > 0);
--> statement-breakpoint

ALTER TABLE "seller_payouts"
  ADD CONSTRAINT "seller_payouts_amount_chk" CHECK ("amount_cents" > 0);
--> statement-breakpoint
