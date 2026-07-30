CREATE TABLE "gamer_surveys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question" text NOT NULL,
	"category" text DEFAULT 'Geral' NOT NULL,
	"options" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "affiliate_offers" ADD COLUMN "consecutive_miss_count" integer DEFAULT 0 NOT NULL;