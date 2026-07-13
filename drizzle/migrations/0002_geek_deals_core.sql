CREATE TYPE "public"."affiliate_offer_status" AS ENUM('draft', 'active', 'paused', 'expired', 'archived');--> statement-breakpoint
CREATE TABLE "affiliate_networks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" "citext" NOT NULL,
	"website_url" text,
	"color_hex" text,
	"tracking_note" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "affiliate_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"master_product_id" uuid NOT NULL,
	"network_id" uuid NOT NULL,
	"title" text NOT NULL,
	"slug" "citext" NOT NULL,
	"affiliate_url" text NOT NULL,
	"image_url" text,
	"store_name" text,
	"current_price_cents" bigint NOT NULL,
	"currency" text DEFAULT 'BRL' NOT NULL,
	"status" "affiliate_offer_status" DEFAULT 'draft' NOT NULL,
	"highlight_note" text,
	"published_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "affiliate_offers_price_chk" CHECK ("affiliate_offers"."current_price_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "affiliate_coupons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"network_id" uuid NOT NULL,
	"code" "citext" NOT NULL,
	"description" text,
	"discount_type" "promotion_type" NOT NULL,
	"discount_value" numeric(12, 2) NOT NULL,
	"min_order_cents" bigint,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_until" timestamp with time zone,
	"status" "coupon_status" DEFAULT 'active' NOT NULL,
	"scope" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "affiliate_price_snapshots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"offer_id" uuid NOT NULL,
	"price_cents" bigint NOT NULL,
	"list_price_cents" bigint,
	"discount_percent" numeric(5, 2),
	"coupon_code" text,
	"collected_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "affiliate_price_snapshots_price_chk" CHECK ("affiliate_price_snapshots"."price_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "affiliate_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offer_id" uuid NOT NULL,
	"message_text" text NOT NULL,
	"price_cents_at_send" bigint NOT NULL,
	"channel" text DEFAULT 'whatsapp' NOT NULL,
	"destination" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "affiliate_offers" ADD CONSTRAINT "affiliate_offers_master_product_id_master_products_id_fk" FOREIGN KEY ("master_product_id") REFERENCES "public"."master_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_offers" ADD CONSTRAINT "affiliate_offers_network_id_affiliate_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."affiliate_networks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_offers" ADD CONSTRAINT "affiliate_offers_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_coupons" ADD CONSTRAINT "affiliate_coupons_network_id_affiliate_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."affiliate_networks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_coupons" ADD CONSTRAINT "affiliate_coupons_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_messages" ADD CONSTRAINT "affiliate_messages_offer_id_affiliate_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."affiliate_offers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_messages" ADD CONSTRAINT "affiliate_messages_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "affiliate_networks_name_uq" ON "affiliate_networks" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "affiliate_networks_slug_uq" ON "affiliate_networks" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "affiliate_offers_slug_uq" ON "affiliate_offers" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "affiliate_offers_master_idx" ON "affiliate_offers" USING btree ("master_product_id");--> statement-breakpoint
CREATE INDEX "affiliate_offers_network_idx" ON "affiliate_offers" USING btree ("network_id");--> statement-breakpoint
CREATE INDEX "affiliate_offers_status_published_idx" ON "affiliate_offers" USING btree ("status","published_at") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "affiliate_coupons_network_code_uq" ON "affiliate_coupons" USING btree ("network_id","code");--> statement-breakpoint
CREATE INDEX "affiliate_coupons_status_valid_idx" ON "affiliate_coupons" USING btree ("status","valid_until");--> statement-breakpoint
CREATE INDEX "affiliate_price_snapshots_offer_collected_idx" ON "affiliate_price_snapshots" USING btree ("offer_id","collected_at");--> statement-breakpoint
CREATE INDEX "affiliate_price_snapshots_collected_brin" ON "affiliate_price_snapshots" USING brin ("collected_at");--> statement-breakpoint
CREATE INDEX "affiliate_messages_offer_created_idx" ON "affiliate_messages" USING btree ("offer_id","created_at");--> statement-breakpoint
CREATE INDEX "affiliate_messages_created_idx" ON "affiliate_messages" USING btree ("created_at");