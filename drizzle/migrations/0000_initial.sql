-- ============================================================
-- Extensões Postgres necessárias (idempotentes)
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS "citext";--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS "pg_trgm";--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS "unaccent";--> statement-breakpoint

CREATE TYPE "public"."badge_tier" AS ENUM('bronze', 'silver', 'gold', 'platinum', 'legendary');--> statement-breakpoint
CREATE TYPE "public"."coupon_status" AS ENUM('active', 'paused', 'expired', 'used_up');--> statement-breakpoint
CREATE TYPE "public"."drop_access" AS ENUM('public', 'waitlist', 'invite_only', 'tier_locked');--> statement-breakpoint
CREATE TYPE "public"."drop_status" AS ENUM('scheduled', 'live', 'sold_out', 'ended', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."fulfillment_status" AS ENUM('pending', 'preparing', 'shipped', 'delivered', 'returned');--> statement-breakpoint
CREATE TYPE "public"."kyc_status" AS ENUM('pending', 'approved', 'rejected', 'expired');--> statement-breakpoint
CREATE TYPE "public"."media_type" AS ENUM('image', 'video', 'model_3d', '360');--> statement-breakpoint
CREATE TYPE "public"."mission_status" AS ENUM('active', 'completed', 'expired', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('email', 'push', 'whatsapp', 'sms', 'in_app');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('queued', 'sent', 'delivered', 'failed', 'bounced', 'clicked');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending_payment', 'paid', 'preparing', 'shipped', 'delivered', 'completed', 'cancelled', 'refunded', 'disputed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('pix', 'credit_card', 'debit_card', 'boleto', 'wallet', 'wallet_internal');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'authorized', 'captured', 'failed', 'cancelled', 'refunded', 'partial_refund', 'chargeback');--> statement-breakpoint
CREATE TYPE "public"."point_reason" AS ENUM('signup', 'purchase', 'review', 'referral', 'redeem', 'expire', 'admin_adjust', 'refund_reversal', 'mission', 'birthday', 'drop_participation');--> statement-breakpoint
CREATE TYPE "public"."product_condition" AS ENUM('new', 'sealed', 'open_box', 'used_like_new', 'used_good', 'used_fair', 'collector');--> statement-breakpoint
CREATE TYPE "public"."product_status" AS ENUM('draft', 'active', 'paused', 'archived');--> statement-breakpoint
CREATE TYPE "public"."promotion_type" AS ENUM('percentage', 'fixed', 'free_shipping', 'bxgy', 'points_multiplier');--> statement-breakpoint
CREATE TYPE "public"."refund_status" AS ENUM('pending', 'approved', 'processed', 'failed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('pending', 'approved', 'rejected', 'flagged', 'hidden');--> statement-breakpoint
CREATE TYPE "public"."seller_status" AS ENUM('pending_kyc', 'active', 'suspended', 'terminated');--> statement-breakpoint
CREATE TYPE "public"."shipment_status" AS ENUM('label_created', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'returned', 'lost');--> statement-breakpoint
CREATE TYPE "public"."stock_movement_type" AS ENUM('inbound', 'outbound', 'adjustment', 'reservation', 'release', 'loss');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('customer', 'seller', 'seller_staff', 'support', 'moderator', 'admin', 'super_admin');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'suspended', 'deleted');--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"avatar_url" text,
	"phone" text,
	"phone_verified_at" timestamp with time zone,
	"birthdate" date,
	"cpf_hash" text,
	"role" "user_role" DEFAULT 'customer' NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"preferences" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"marketing_consent" boolean DEFAULT false NOT NULL,
	"geek_points" integer DEFAULT 0 NOT NULL,
	"level_id" uuid,
	"total_orders" integer DEFAULT 0 NOT NULL,
	"total_spent_cents" bigint DEFAULT 0 NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"label" text,
	"recipient_name" text NOT NULL,
	"cep" text NOT NULL,
	"street" text NOT NULL,
	"number" text NOT NULL,
	"complement" text,
	"neighborhood" text NOT NULL,
	"city" text NOT NULL,
	"state" char(2) NOT NULL,
	"country" char(2) DEFAULT 'BR' NOT NULL,
	"reference" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referrals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referrer_id" uuid NOT NULL,
	"referred_id" uuid NOT NULL,
	"code" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"qualified_at" timestamp with time zone,
	"rewarded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sellers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"company_name" text NOT NULL,
	"display_name" text NOT NULL,
	"slug" "citext" NOT NULL,
	"cnpj" text NOT NULL,
	"email_business" "citext" NOT NULL,
	"phone" text,
	"description" text,
	"logo_url" text,
	"banner_url" text,
	"status" "seller_status" DEFAULT 'pending_kyc' NOT NULL,
	"commission_rate" numeric(5, 4) DEFAULT '0.1200' NOT NULL,
	"mp_account_id" text,
	"bank_account_encrypted" "bytea",
	"approved_at" timestamp with time zone,
	"suspended_at" timestamp with time zone,
	"suspension_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "seller_kyc_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" uuid NOT NULL,
	"doc_type" text NOT NULL,
	"storage_path" text NOT NULL,
	"status" "kyc_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"rejection_reason" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seller_metrics" (
	"seller_id" uuid PRIMARY KEY NOT NULL,
	"avg_rating" numeric(3, 2) DEFAULT '0' NOT NULL,
	"total_reviews" integer DEFAULT 0 NOT NULL,
	"total_orders" integer DEFAULT 0 NOT NULL,
	"total_sales_cents" bigint DEFAULT 0 NOT NULL,
	"cancellation_rate" numeric(5, 4) DEFAULT '0' NOT NULL,
	"avg_ship_hours" numeric(6, 2),
	"on_time_rate" numeric(5, 4) DEFAULT '1.0000' NOT NULL,
	"last_calculated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seller_payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	"currency" char(3) DEFAULT 'BRL' NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"gateway_payout_id" text,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" "citext" NOT NULL,
	"logo_url" text,
	"description" text,
	"is_official" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "franchises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" "citext" NOT NULL,
	"description" text,
	"banner_url" text,
	"icon_url" text,
	"parent_id" uuid,
	"popularity_score" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"slug" "citext" NOT NULL,
	"path" text NOT NULL,
	"level" smallint NOT NULL,
	"icon_url" text,
	"banner_url" text,
	"description" text,
	"attribute_schema" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "master_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gtin" text,
	"mpn" text,
	"name" text NOT NULL,
	"slug" "citext" NOT NULL,
	"description" text,
	"brand_id" uuid,
	"category_id" uuid,
	"franchise_id" uuid,
	"release_year" smallint,
	"manufacturer" text,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"default_images" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" uuid NOT NULL,
	"master_product_id" uuid,
	"category_id" uuid NOT NULL,
	"brand_id" uuid,
	"franchise_id" uuid,
	"title" text NOT NULL,
	"slug" "citext" NOT NULL,
	"description" text,
	"short_description" text,
	"condition" "product_condition" DEFAULT 'new' NOT NULL,
	"is_authentic" boolean DEFAULT true NOT NULL,
	"is_exclusive" boolean DEFAULT false NOT NULL,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "product_status" DEFAULT 'draft' NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"sale_count" integer DEFAULT 0 NOT NULL,
	"popularity_score" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp with time zone,
	"search_tsv" "tsvector",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"name" text,
	"options" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"price_cents" bigint NOT NULL,
	"compare_at_cents" bigint,
	"cost_cents" bigint,
	"currency" char(3) DEFAULT 'BRL' NOT NULL,
	"weight_g" integer DEFAULT 0 NOT NULL,
	"width_cm" numeric(6, 2),
	"height_cm" numeric(6, 2),
	"length_cm" numeric(6, 2),
	"barcode" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "product_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"variant_id" uuid,
	"type" "media_type" DEFAULT 'image' NOT NULL,
	"url" text NOT NULL,
	"thumbnail_url" text,
	"alt_text" text DEFAULT '' NOT NULL,
	"width" integer,
	"height" integer,
	"position" smallint DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_ratings" (
	"product_id" uuid PRIMARY KEY NOT NULL,
	"avg_rating" numeric(3, 2) DEFAULT '0' NOT NULL,
	"total_reviews" integer DEFAULT 0 NOT NULL,
	"distribution" jsonb DEFAULT '{"1":0,"2":0,"3":0,"4":0,"5":0}'::jsonb NOT NULL,
	"last_review_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"reason" text NOT NULL,
	"ref_type" text,
	"ref_id" uuid,
	"user_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"released_at" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "stock_movements_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"variant_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"type" "stock_movement_type" NOT NULL,
	"quantity" integer NOT NULL,
	"before_on_hand" integer NOT NULL,
	"after_on_hand" integer NOT NULL,
	"ref_type" text,
	"ref_id" uuid,
	"notes" text,
	"performed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"on_hand" integer DEFAULT 0 NOT NULL,
	"reserved" integer DEFAULT 0 NOT NULL,
	"available" integer,
	"reorder_point" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"seller_id" uuid,
	"cep" text NOT NULL,
	"city" text NOT NULL,
	"state" char(2) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coupon_uses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coupon_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"discount_cents" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" "citext" NOT NULL,
	"description" text,
	"type" "promotion_type" NOT NULL,
	"value" numeric(12, 2) NOT NULL,
	"min_order_cents" bigint DEFAULT 0 NOT NULL,
	"max_discount_cents" bigint,
	"usage_limit" integer,
	"usage_limit_per_user" integer DEFAULT 1 NOT NULL,
	"used_count" integer DEFAULT 0 NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	"status" "coupon_status" DEFAULT 'active' NOT NULL,
	"scope" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promotions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" "promotion_type" NOT NULL,
	"value" numeric(12, 2) NOT NULL,
	"scope" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cart_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cart_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"price_snapshot_cents" bigint NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "carts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"session_id" text,
	"currency" char(3) DEFAULT 'BRL' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone DEFAULT now() + interval '30 days' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fulfillment_items" (
	"fulfillment_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"quantity" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fulfillments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"seller_id" uuid NOT NULL,
	"status" "fulfillment_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"from_status" "order_status",
	"to_status" "order_status",
	"actor_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"seller_id" uuid NOT NULL,
	"title_snapshot" text NOT NULL,
	"variant_snapshot" jsonb NOT NULL,
	"image_snapshot" text,
	"quantity" integer NOT NULL,
	"unit_price_cents" bigint NOT NULL,
	"subtotal_cents" bigint NOT NULL,
	"commission_rate" numeric(5, 4) NOT NULL,
	"commission_cents" bigint NOT NULL,
	"seller_receivable_cents" bigint NOT NULL,
	"drop_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_number" text NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "order_status" DEFAULT 'pending_payment' NOT NULL,
	"currency" char(3) DEFAULT 'BRL' NOT NULL,
	"subtotal_cents" bigint NOT NULL,
	"shipping_cents" bigint DEFAULT 0 NOT NULL,
	"discount_cents" bigint DEFAULT 0 NOT NULL,
	"points_redeemed" integer DEFAULT 0 NOT NULL,
	"points_discount_cents" bigint DEFAULT 0 NOT NULL,
	"total_cents" bigint NOT NULL,
	"shipping_address" jsonb NOT NULL,
	"billing_address" jsonb,
	"coupon_code" text,
	"notes" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source" text DEFAULT 'web' NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"paid_at" timestamp with time zone,
	"shipped_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fulfillment_id" uuid NOT NULL,
	"carrier" text NOT NULL,
	"service" text,
	"tracking_code" text,
	"tracking_url" text,
	"label_url" text,
	"status" "shipment_status" DEFAULT 'label_created' NOT NULL,
	"shipped_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"shipping_cost_cents" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_splits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"recipient_type" text NOT NULL,
	"recipient_id" uuid,
	"amount_cents" bigint NOT NULL,
	"gateway_split_id" text
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"gateway" text NOT NULL,
	"gateway_id" text NOT NULL,
	"method" "payment_method" NOT NULL,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"amount_cents" bigint NOT NULL,
	"currency" char(3) DEFAULT 'BRL' NOT NULL,
	"installments" smallint,
	"pix_qr" text,
	"pix_expires_at" timestamp with time zone,
	"card_brand" text,
	"card_last4" text,
	"boleto_url" text,
	"boleto_barcode" text,
	"boleto_due_at" timestamp with time zone,
	"raw_request" jsonb,
	"raw_response" jsonb,
	"failure_code" text,
	"failure_reason" text,
	"authorized_at" timestamp with time zone,
	"captured_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	"reason" text NOT NULL,
	"status" "refund_status" DEFAULT 'pending' NOT NULL,
	"gateway_refund_id" text,
	"requested_by" uuid,
	"processed_at" timestamp with time zone,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refunds_gateway_refund_id_unique" UNIQUE("gateway_refund_id")
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"gateway" text NOT NULL,
	"event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"signature" text,
	"processed_at" timestamp with time zone,
	"processing_error" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drop_access_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"drop_id" uuid NOT NULL,
	"user_id" uuid,
	"ip_hash" text,
	"fingerprint" text,
	"action" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drop_purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drop_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drop_waitlist" (
	"drop_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"notify_channels" text[] DEFAULT ARRAY['push','email'] NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notified_at" timestamp with time zone,
	CONSTRAINT "drop_waitlist_drop_id_user_id_pk" PRIMARY KEY("drop_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "drops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid,
	"variant_id" uuid,
	"title" text NOT NULL,
	"slug" "citext" NOT NULL,
	"description" text,
	"banner_url" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"stock_limit" integer NOT NULL,
	"stock_sold" integer DEFAULT 0 NOT NULL,
	"per_user_limit" integer DEFAULT 1 NOT NULL,
	"price_cents" bigint,
	"access_type" "drop_access" DEFAULT 'public' NOT NULL,
	"required_level_id" uuid,
	"required_account_age_days" integer DEFAULT 0 NOT NULL,
	"status" "drop_status" DEFAULT 'scheduled' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "badges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"icon_url" text NOT NULL,
	"tier" "badge_tier" DEFAULT 'bronze' NOT NULL,
	"criteria" jsonb NOT NULL,
	"reward_points" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_secret" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "levels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"min_points" integer NOT NULL,
	"min_orders" integer DEFAULT 0 NOT NULL,
	"benefits" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"icon_url" text,
	"color" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "missions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"criteria" jsonb NOT NULL,
	"reward_points" integer NOT NULL,
	"reward_badge_id" uuid,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "point_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"description" text,
	"trigger_event" text NOT NULL,
	"formula" jsonb NOT NULL,
	"conditions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"validity_days" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "points_ledger" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"delta" integer NOT NULL,
	"reason" "point_reason" NOT NULL,
	"ref_type" text,
	"ref_id" uuid,
	"description" text,
	"balance_after" integer NOT NULL,
	"expires_at" timestamp with time zone,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_badges" (
	"user_id" uuid NOT NULL,
	"badge_id" uuid NOT NULL,
	"progress" jsonb,
	"earned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_badges_user_id_badge_id_pk" PRIMARY KEY("user_id","badge_id")
);
--> statement-breakpoint
CREATE TABLE "user_missions" (
	"user_id" uuid NOT NULL,
	"mission_id" uuid NOT NULL,
	"status" "mission_status" DEFAULT 'active' NOT NULL,
	"progress" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	CONSTRAINT "user_missions_user_id_mission_id_pk" PRIMARY KEY("user_id","mission_id")
);
--> statement-breakpoint
CREATE TABLE "product_views" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"user_id" uuid,
	"session_id" text,
	"source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_votes" (
	"review_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"vote" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_votes_review_id_user_id_pk" PRIMARY KEY("review_id","user_id"),
	CONSTRAINT "review_votes_vote_chk" CHECK ("review_votes"."vote" IN (-1, 1))
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"variant_id" uuid,
	"user_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"rating" smallint NOT NULL,
	"title" text,
	"comment" text,
	"images" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "review_status" DEFAULT 'pending' NOT NULL,
	"helpful_count" integer DEFAULT 0 NOT NULL,
	"unhelpful_count" integer DEFAULT 0 NOT NULL,
	"seller_response" text,
	"seller_responded_at" timestamp with time zone,
	"moderation_reason" text,
	"moderated_by" uuid,
	"moderated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "reviews_rating_chk" CHECK ("reviews"."rating" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE "wishlists" (
	"user_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"notify_on_promo" integer DEFAULT 1 NOT NULL,
	"notify_on_restock" integer DEFAULT 1 NOT NULL,
	"target_price_cents" bigint,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wishlists_user_id_variant_id_pk" PRIMARY KEY("user_id","variant_id")
);
--> statement-breakpoint
CREATE TABLE "search_queries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"query" text NOT NULL,
	"normalized_query" text NOT NULL,
	"user_id" uuid,
	"session_id" text,
	"results_count" integer NOT NULL,
	"clicked_product_id" uuid,
	"position_clicked" smallint,
	"filters" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "synonyms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"term" "citext" NOT NULL,
	"synonym" "citext" NOT NULL,
	"weight" numeric(3, 2) DEFAULT '1.00' NOT NULL,
	"language" char(2) DEFAULT 'pt' NOT NULL,
	"is_bidirectional" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trending_terms" (
	"term" text PRIMARY KEY NOT NULL,
	"search_count" integer NOT NULL,
	"rank" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"channel" "notification_channel" NOT NULL,
	"template_code" text NOT NULL,
	"recipient" text NOT NULL,
	"subject" text,
	"payload" jsonb,
	"status" "notification_status" DEFAULT 'queued' NOT NULL,
	"provider" text,
	"provider_id" text,
	"error" text,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"opened_at" timestamp with time zone,
	"clicked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"email_marketing" boolean DEFAULT false NOT NULL,
	"email_transactional" boolean DEFAULT true NOT NULL,
	"push_drops" boolean DEFAULT true NOT NULL,
	"push_orders" boolean DEFAULT true NOT NULL,
	"whatsapp_orders" boolean DEFAULT true NOT NULL,
	"whatsapp_marketing" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"platform" text NOT NULL,
	"device_info" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"event_name" text NOT NULL,
	"event_version" smallint DEFAULT 1 NOT NULL,
	"user_id" uuid,
	"anonymous_id" text,
	"session_id" text,
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity_links" (
	"anonymous_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "identity_links_anonymous_id_user_id_pk" PRIMARY KEY("anonymous_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_id" uuid,
	"actor_role" "user_role",
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"before" jsonb,
	"after" jsonb,
	"diff" jsonb,
	"ip_hash" text,
	"user_agent" text,
	"request_id" text,
	"prev_hash" text,
	"hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"key" text PRIMARY KEY NOT NULL,
	"description" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rollout_percentage" smallint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"key" text PRIMARY KEY NOT NULL,
	"endpoint" text NOT NULL,
	"user_id" uuid,
	"request_hash" text NOT NULL,
	"response_body" jsonb,
	"response_status" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone DEFAULT now() + interval '24 hours' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seo_redirects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"old_path" "citext" NOT NULL,
	"new_path" text NOT NULL,
	"status_code" smallint DEFAULT 301 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_config" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"description" text,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_id_profiles_id_fk" FOREIGN KEY ("referrer_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referred_id_profiles_id_fk" FOREIGN KEY ("referred_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sellers" ADD CONSTRAINT "sellers_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_kyc_documents" ADD CONSTRAINT "seller_kyc_documents_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_kyc_documents" ADD CONSTRAINT "seller_kyc_documents_reviewed_by_profiles_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_metrics" ADD CONSTRAINT "seller_metrics_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_payouts" ADD CONSTRAINT "seller_payouts_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "franchises" ADD CONSTRAINT "franchises_parent_id_franchises_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."franchises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master_products" ADD CONSTRAINT "master_products_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master_products" ADD CONSTRAINT "master_products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master_products" ADD CONSTRAINT "master_products_franchise_id_franchises_id_fk" FOREIGN KEY ("franchise_id") REFERENCES "public"."franchises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_master_product_id_master_products_id_fk" FOREIGN KEY ("master_product_id") REFERENCES "public"."master_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_franchise_id_franchises_id_fk" FOREIGN KEY ("franchise_id") REFERENCES "public"."franchises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_ratings" ADD CONSTRAINT "product_ratings_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_performed_by_profiles_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stocks" ADD CONSTRAINT "stocks_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stocks" ADD CONSTRAINT "stocks_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_uses" ADD CONSTRAINT "coupon_uses_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_uses" ADD CONSTRAINT "coupon_uses_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillment_items" ADD CONSTRAINT "fulfillment_items_fulfillment_id_fulfillments_id_fk" FOREIGN KEY ("fulfillment_id") REFERENCES "public"."fulfillments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillment_items" ADD CONSTRAINT "fulfillment_items_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillments" ADD CONSTRAINT "fulfillments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillments" ADD CONSTRAINT "fulfillments_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_fulfillment_id_fulfillments_id_fk" FOREIGN KEY ("fulfillment_id") REFERENCES "public"."fulfillments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_splits" ADD CONSTRAINT "payment_splits_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_requested_by_profiles_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drop_purchases" ADD CONSTRAINT "drop_purchases_drop_id_drops_id_fk" FOREIGN KEY ("drop_id") REFERENCES "public"."drops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drop_purchases" ADD CONSTRAINT "drop_purchases_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drop_purchases" ADD CONSTRAINT "drop_purchases_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drop_waitlist" ADD CONSTRAINT "drop_waitlist_drop_id_drops_id_fk" FOREIGN KEY ("drop_id") REFERENCES "public"."drops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drop_waitlist" ADD CONSTRAINT "drop_waitlist_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drops" ADD CONSTRAINT "drops_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drops" ADD CONSTRAINT "drops_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drops" ADD CONSTRAINT "drops_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missions" ADD CONSTRAINT "missions_reward_badge_id_badges_id_fk" FOREIGN KEY ("reward_badge_id") REFERENCES "public"."badges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "points_ledger" ADD CONSTRAINT "points_ledger_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_badge_id_badges_id_fk" FOREIGN KEY ("badge_id") REFERENCES "public"."badges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_missions" ADD CONSTRAINT "user_missions_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_missions" ADD CONSTRAINT "user_missions_mission_id_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."missions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_votes" ADD CONSTRAINT "review_votes_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_votes" ADD CONSTRAINT "review_votes_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_moderated_by_profiles_id_fk" FOREIGN KEY ("moderated_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlists" ADD CONSTRAINT "wishlists_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlists" ADD CONSTRAINT "wishlists_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_links" ADD CONSTRAINT "identity_links_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_email_uq" ON "profiles" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_cpf_hash_uq" ON "profiles" USING btree ("cpf_hash");--> statement-breakpoint
CREATE INDEX "profiles_level_idx" ON "profiles" USING btree ("level_id");--> statement-breakpoint
CREATE INDEX "profiles_role_idx" ON "profiles" USING btree ("role");--> statement-breakpoint
CREATE INDEX "addresses_user_idx" ON "addresses" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "addresses_one_default_per_user_uq" ON "addresses" USING btree ("user_id") WHERE is_default;--> statement-breakpoint
CREATE UNIQUE INDEX "referrals_referred_uq" ON "referrals" USING btree ("referred_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sellers_user_uq" ON "sellers" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sellers_slug_uq" ON "sellers" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "sellers_cnpj_uq" ON "sellers" USING btree ("cnpj");--> statement-breakpoint
CREATE INDEX "sellers_status_idx" ON "sellers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "seller_kyc_seller_status_idx" ON "seller_kyc_documents" USING btree ("seller_id","status");--> statement-breakpoint
CREATE INDEX "seller_payouts_seller_period_idx" ON "seller_payouts" USING btree ("seller_id","period_end");--> statement-breakpoint
CREATE UNIQUE INDEX "brands_name_uq" ON "brands" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "brands_slug_uq" ON "brands" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "franchises_name_uq" ON "franchises" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "franchises_slug_uq" ON "franchises" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "franchises_popularity_idx" ON "franchises" USING btree ("popularity_score");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_slug_uq" ON "categories" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "categories_parent_idx" ON "categories" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "categories_path_idx" ON "categories" USING btree ("path");--> statement-breakpoint
CREATE UNIQUE INDEX "master_products_slug_uq" ON "master_products" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "master_products_gtin_uq" ON "master_products" USING btree ("gtin");--> statement-breakpoint
CREATE INDEX "master_products_brand_idx" ON "master_products" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "master_products_franchise_idx" ON "master_products" USING btree ("franchise_id");--> statement-breakpoint
CREATE INDEX "master_products_category_idx" ON "master_products" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "products_slug_uq" ON "products" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "products_seller_idx" ON "products" USING btree ("seller_id");--> statement-breakpoint
CREATE INDEX "products_category_status_idx" ON "products" USING btree ("category_id","status");--> statement-breakpoint
CREATE INDEX "products_brand_idx" ON "products" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "products_franchise_idx" ON "products" USING btree ("franchise_id");--> statement-breakpoint
CREATE INDEX "products_master_idx" ON "products" USING btree ("master_product_id");--> statement-breakpoint
CREATE INDEX "products_popularity_idx" ON "products" USING btree ("popularity_score");--> statement-breakpoint
CREATE UNIQUE INDEX "variants_sku_uq" ON "product_variants" USING btree ("sku") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "variants_product_idx" ON "product_variants" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "variants_one_default_per_product_uq" ON "product_variants" USING btree ("product_id") WHERE is_default;--> statement-breakpoint
CREATE INDEX "product_media_product_pos_idx" ON "product_media" USING btree ("product_id","position");--> statement-breakpoint
CREATE INDEX "product_media_variant_idx" ON "product_media" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "reservations_expires_idx" ON "reservations" USING btree ("expires_at") WHERE released_at IS NULL AND consumed_at IS NULL;--> statement-breakpoint
CREATE INDEX "reservations_ref_idx" ON "reservations" USING btree ("ref_type","ref_id");--> statement-breakpoint
CREATE INDEX "stock_movements_variant_created_idx" ON "stock_movements" USING btree ("variant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "stocks_variant_warehouse_uq" ON "stocks" USING btree ("variant_id","warehouse_id");--> statement-breakpoint
CREATE INDEX "stocks_variant_idx" ON "stocks" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "stocks_available_idx" ON "stocks" USING btree ("available") WHERE available > 0;--> statement-breakpoint
CREATE UNIQUE INDEX "coupon_uses_coupon_order_uq" ON "coupon_uses" USING btree ("coupon_id","order_id");--> statement-breakpoint
CREATE INDEX "coupon_uses_coupon_user_idx" ON "coupon_uses" USING btree ("coupon_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "coupons_code_uq" ON "coupons" USING btree ("code");--> statement-breakpoint
CREATE INDEX "coupons_status_valid_idx" ON "coupons" USING btree ("status","valid_until");--> statement-breakpoint
CREATE INDEX "promotions_window_idx" ON "promotions" USING btree ("starts_at","ends_at") WHERE is_active;--> statement-breakpoint
CREATE UNIQUE INDEX "cart_items_cart_variant_uq" ON "cart_items" USING btree ("cart_id","variant_id");--> statement-breakpoint
CREATE INDEX "carts_user_idx" ON "carts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "carts_session_idx" ON "carts" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "carts_expires_guest_idx" ON "carts" USING btree ("expires_at") WHERE user_id IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "fulfillment_items_pk" ON "fulfillment_items" USING btree ("fulfillment_id","order_item_id");--> statement-breakpoint
CREATE INDEX "order_events_order_created_idx" ON "order_events" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE INDEX "order_events_unpublished_idx" ON "order_events" USING btree ("published_at") WHERE published_at IS NULL;--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_items_seller_idx" ON "order_items" USING btree ("seller_id");--> statement-breakpoint
CREATE INDEX "order_items_variant_idx" ON "order_items" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "order_items_product_idx" ON "order_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "order_items_drop_idx" ON "order_items" USING btree ("drop_id") WHERE drop_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "orders_number_uq" ON "orders" USING btree ("order_number");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_idempotency_uq" ON "orders" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "orders_user_created_idx" ON "orders" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status") WHERE status IN ('pending_payment','paid','preparing','shipped');--> statement-breakpoint
CREATE INDEX "orders_created_idx" ON "orders" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "shipments_tracking_idx" ON "shipments" USING btree ("tracking_code");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_gateway_id_uq" ON "payments" USING btree ("gateway","gateway_id");--> statement-breakpoint
CREATE INDEX "payments_order_idx" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "payments_status_created_idx" ON "payments" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_gateway_event_uq" ON "webhook_events" USING btree ("gateway","event_id");--> statement-breakpoint
CREATE INDEX "webhook_events_unprocessed_idx" ON "webhook_events" USING btree ("processed_at") WHERE processed_at IS NULL;--> statement-breakpoint
CREATE INDEX "drop_access_log_drop_created_idx" ON "drop_access_log" USING btree ("drop_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "drop_purchases_drop_user_order_uq" ON "drop_purchases" USING btree ("drop_id","user_id","order_id");--> statement-breakpoint
CREATE INDEX "drop_purchases_drop_created_idx" ON "drop_purchases" USING btree ("drop_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "drops_slug_uq" ON "drops" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "drops_status_starts_idx" ON "drops" USING btree ("status","starts_at");--> statement-breakpoint
CREATE INDEX "drops_upcoming_idx" ON "drops" USING btree ("starts_at") WHERE status IN ('scheduled','live');--> statement-breakpoint
CREATE UNIQUE INDEX "badges_code_uq" ON "badges" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "levels_code_uq" ON "levels" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "missions_code_uq" ON "missions" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "point_rules_code_uq" ON "point_rules" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "points_ledger_idempotency_uq" ON "points_ledger" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "points_ledger_user_created_idx" ON "points_ledger" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "points_ledger_expires_idx" ON "points_ledger" USING btree ("expires_at") WHERE expires_at IS NOT NULL AND delta > 0;--> statement-breakpoint
CREATE INDEX "user_badges_user_earned_idx" ON "user_badges" USING btree ("user_id","earned_at");--> statement-breakpoint
CREATE INDEX "product_views_product_created_idx" ON "product_views" USING btree ("product_id","created_at");--> statement-breakpoint
CREATE INDEX "product_views_user_created_idx" ON "product_views" USING btree ("user_id","created_at") WHERE user_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_order_item_uq" ON "reviews" USING btree ("order_item_id");--> statement-breakpoint
CREATE INDEX "reviews_product_status_idx" ON "reviews" USING btree ("product_id","status") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "reviews_user_created_idx" ON "reviews" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "wishlists_variant_idx" ON "wishlists" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "wishlists_user_added_idx" ON "wishlists" USING btree ("user_id","added_at");--> statement-breakpoint
CREATE INDEX "search_queries_normalized_created_idx" ON "search_queries" USING btree ("normalized_query","created_at");--> statement-breakpoint
CREATE INDEX "search_queries_user_created_idx" ON "search_queries" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "synonyms_term_synonym_lang_uq" ON "synonyms" USING btree ("term","synonym","language");--> statement-breakpoint
CREATE INDEX "notification_deliveries_user_created_idx" ON "notification_deliveries" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "notification_deliveries_queued_idx" ON "notification_deliveries" USING btree ("status") WHERE status = 'queued';--> statement-breakpoint
CREATE UNIQUE INDEX "push_tokens_token_uq" ON "push_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "analytics_events_name_created_idx" ON "analytics_events" USING btree ("event_name","created_at");--> statement-breakpoint
CREATE INDEX "analytics_events_user_created_idx" ON "analytics_events" USING btree ("user_id","created_at") WHERE user_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "analytics_events_created_brin" ON "analytics_events" USING brin ("created_at");--> statement-breakpoint
CREATE INDEX "audit_log_entity_created_idx" ON "audit_log" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_actor_created_idx" ON "audit_log" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_created_brin" ON "audit_log" USING brin ("created_at");--> statement-breakpoint
CREATE INDEX "idempotency_keys_expires_idx" ON "idempotency_keys" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "seo_redirects_old_path_uq" ON "seo_redirects" USING btree ("old_path");