CREATE TYPE "public"."game_edition_source" AS ENUM('structured', 'keyword_rule', 'manual');--> statement-breakpoint
CREATE TYPE "public"."game_edition_type" AS ENUM('full_game', 'upgrade_pack', 'dlc', 'bundle', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."game_format" AS ENUM('physical', 'digital', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."game_platform_gen" AS ENUM('switch_1', 'switch_2', 'unknown');--> statement-breakpoint
CREATE TABLE "affiliate_sellers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"network_id" uuid NOT NULL,
	"external_seller_id" text NOT NULL,
	"nickname" text,
	"reputation_level" text,
	"power_seller_status" text,
	"total_sales" integer,
	"positive_rating_percent" numeric(5, 2),
	"refreshed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "master_products" ADD COLUMN "game_format" "game_format" DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "master_products" ADD COLUMN "game_platform_gen" "game_platform_gen" DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "master_products" ADD COLUMN "game_edition_type" "game_edition_type" DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "master_products" ADD COLUMN "game_edition_source" "game_edition_source";--> statement-breakpoint
ALTER TABLE "master_products" ADD COLUMN "game_collection" text;--> statement-breakpoint
ALTER TABLE "master_products" ADD COLUMN "meli_catalog_id" text;--> statement-breakpoint
ALTER TABLE "master_products" ADD COLUMN "classified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "affiliate_offers" ADD COLUMN "seller_id" uuid;--> statement-breakpoint
ALTER TABLE "affiliate_sellers" ADD CONSTRAINT "affiliate_sellers_network_id_affiliate_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."affiliate_networks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "affiliate_sellers_network_external_uq" ON "affiliate_sellers" USING btree ("network_id","external_seller_id");--> statement-breakpoint
ALTER TABLE "affiliate_offers" ADD CONSTRAINT "affiliate_offers_seller_id_affiliate_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."affiliate_sellers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "master_products_meli_catalog_id_uq" ON "master_products" USING btree ("meli_catalog_id") WHERE meli_catalog_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "master_products_game_classification_idx" ON "master_products" USING btree ("game_format","game_platform_gen","game_edition_type");