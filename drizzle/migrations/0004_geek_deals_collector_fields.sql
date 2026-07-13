CREATE TYPE "public"."affiliate_price_source" AS ENUM('manual', 'api', 'scrape');--> statement-breakpoint
ALTER TABLE "affiliate_offers" ADD COLUMN "external_ref" text;--> statement-breakpoint
ALTER TABLE "affiliate_offers" ADD COLUMN "last_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "affiliate_price_snapshots" ADD COLUMN "source" "affiliate_price_source" DEFAULT 'manual' NOT NULL;