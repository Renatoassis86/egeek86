ALTER TYPE "public"."notification_channel" ADD VALUE 'telegram';--> statement-breakpoint
CREATE TABLE "affiliate_price_watches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"master_product_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"target_price_cents" bigint,
	"last_notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_link_tokens" (
	"token" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD COLUMN "email_price_alerts" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD COLUMN "telegram_price_alerts" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD COLUMN "telegram_chat_id" text;--> statement-breakpoint
ALTER TABLE "affiliate_price_watches" ADD CONSTRAINT "affiliate_price_watches_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_price_watches" ADD CONSTRAINT "affiliate_price_watches_master_product_id_master_products_id_fk" FOREIGN KEY ("master_product_id") REFERENCES "public"."master_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_link_tokens" ADD CONSTRAINT "telegram_link_tokens_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "affiliate_price_watches_user_master_uq" ON "affiliate_price_watches" USING btree ("user_id","master_product_id");--> statement-breakpoint
CREATE INDEX "affiliate_price_watches_master_active_idx" ON "affiliate_price_watches" USING btree ("master_product_id") WHERE is_active = true;