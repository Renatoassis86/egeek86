ALTER TYPE "public"."article_category" ADD VALUE 'filmes';--> statement-breakpoint
ALTER TYPE "public"."article_category" ADD VALUE 'series_tv';--> statement-breakpoint
ALTER TYPE "public"."article_category" ADD VALUE 'animes';--> statement-breakpoint
ALTER TYPE "public"."article_category" ADD VALUE 'games';--> statement-breakpoint
ALTER TYPE "public"."article_category" ADD VALUE 'korea';--> statement-breakpoint
ALTER TYPE "public"."article_category" ADD VALUE 'criticas';--> statement-breakpoint
ALTER TYPE "public"."article_category" ADD VALUE 'listas';--> statement-breakpoint
ALTER TYPE "public"."article_category" ADD VALUE 'colunistas';--> statement-breakpoint
ALTER TYPE "public"."article_category" ADD VALUE 'ccxp';--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'affiliate';--> statement-breakpoint
CREATE TABLE "affiliate_cart_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"offer_id" uuid NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "news_articles" ADD COLUMN "keywords" text;--> statement-breakpoint
ALTER TABLE "affiliate_cart_items" ADD CONSTRAINT "affiliate_cart_items_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_cart_items" ADD CONSTRAINT "affiliate_cart_items_offer_id_affiliate_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."affiliate_offers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "affiliate_cart_items_user_offer_uq" ON "affiliate_cart_items" USING btree ("user_id","offer_id");--> statement-breakpoint
CREATE INDEX "affiliate_cart_items_user_pending_idx" ON "affiliate_cart_items" USING btree ("user_id") WHERE sent_at IS NULL;