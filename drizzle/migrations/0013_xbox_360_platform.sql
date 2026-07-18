ALTER TYPE "public"."game_platform_gen" ADD VALUE 'xbox_360' BEFORE 'unknown';--> statement-breakpoint
CREATE TABLE "drop_curations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drop_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"verdict" text NOT NULL,
	"confidence" integer DEFAULT 3 NOT NULL,
	"notes" text NOT NULL,
	"points_rewarded" integer DEFAULT 0 NOT NULL,
	"is_assertive" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_curations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"verdict" text NOT NULL,
	"notes" text NOT NULL,
	"points_rewarded" integer DEFAULT 0 NOT NULL,
	"is_assertive" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auction_bids" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auction_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"is_winning" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auctions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"images" text[] DEFAULT '{}'::text[] NOT NULL,
	"seller_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"min_bid_cents" integer DEFAULT 100 NOT NULL,
	"reserve_price_cents" integer,
	"buyout_price_cents" integer,
	"current_bid_cents" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending_curation' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "drop_curations" ADD CONSTRAINT "drop_curations_drop_id_drops_id_fk" FOREIGN KEY ("drop_id") REFERENCES "public"."drops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drop_curations" ADD CONSTRAINT "drop_curations_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_curations" ADD CONSTRAINT "review_curations_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_curations" ADD CONSTRAINT "review_curations_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_bids" ADD CONSTRAINT "auction_bids_auction_id_auctions_id_fk" FOREIGN KEY ("auction_id") REFERENCES "public"."auctions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_bids" ADD CONSTRAINT "auction_bids_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auctions" ADD CONSTRAINT "auctions_seller_id_profiles_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "drop_curations_drop_idx" ON "drop_curations" USING btree ("drop_id");--> statement-breakpoint
CREATE INDEX "drop_curations_user_idx" ON "drop_curations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "review_curations_review_idx" ON "review_curations" USING btree ("review_id");--> statement-breakpoint
CREATE INDEX "review_curations_user_idx" ON "review_curations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auction_bids_auction_idx" ON "auction_bids" USING btree ("auction_id");--> statement-breakpoint
CREATE INDEX "auction_bids_user_idx" ON "auction_bids" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auctions_seller_idx" ON "auctions" USING btree ("seller_id");--> statement-breakpoint
CREATE INDEX "auctions_status_idx" ON "auctions" USING btree ("status");