CREATE TYPE "public"."article_category" AS ENUM('cultura_pop', 'sinopse_jogo', 'tecnologia', 'lancamentos');--> statement-breakpoint
CREATE TYPE "public"."article_kind" AS ENUM('original', 'curated_link');--> statement-breakpoint
CREATE TYPE "public"."article_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TABLE "news_articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" "citext" NOT NULL,
	"title" text NOT NULL,
	"excerpt" text NOT NULL,
	"cover_image_url" text,
	"kind" "article_kind" NOT NULL,
	"body_markdown" text,
	"category" "article_category" NOT NULL,
	"source_name" text,
	"source_url" text,
	"status" "article_status" DEFAULT 'draft' NOT NULL,
	"author_id" uuid NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "news_articles_kind_consistency_chk" CHECK (("news_articles"."kind" = 'original' AND "news_articles"."body_markdown" IS NOT NULL AND "news_articles"."source_url" IS NULL)
        OR ("news_articles"."kind" = 'curated_link' AND "news_articles"."source_url" IS NOT NULL AND "news_articles"."body_markdown" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "news_articles" ADD CONSTRAINT "news_articles_author_id_profiles_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "news_articles_slug_uq" ON "news_articles" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "news_articles_status_published_idx" ON "news_articles" USING btree ("status","published_at") WHERE status = 'published';--> statement-breakpoint
CREATE INDEX "news_articles_category_idx" ON "news_articles" USING btree ("category");