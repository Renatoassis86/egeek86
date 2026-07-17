ALTER TABLE "affiliate_offers" ADD COLUMN "last_price_change_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "affiliate_offers" ADD COLUMN "previous_price_cents" bigint;