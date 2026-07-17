CREATE TYPE "public"."product_type" AS ENUM('game', 'console', 'accessory');--> statement-breakpoint
ALTER TABLE "master_products" ADD COLUMN "product_type" "product_type" DEFAULT 'game' NOT NULL;