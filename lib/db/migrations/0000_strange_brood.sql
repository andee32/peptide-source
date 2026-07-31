CREATE TYPE "public"."category" AS ENUM('metabolic', 'longevity', 'recovery', 'cognitive', 'other');--> statement-breakpoint
CREATE TYPE "public"."compliance_status" AS ENUM('blocked', 'restricted', 'cleared');--> statement-breakpoint
CREATE TYPE "public"."sourcing_path" AS ENUM('usa_domestic', 'asia_warehouse');--> statement-breakpoint
CREATE TYPE "public"."unit_type" AS ENUM('vial', 'kit');--> statement-breakpoint
CREATE TYPE "public"."account_status" AS ENUM('pending', 'approved', 'rejected', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."business_type" AS ENUM('research_lab', 'clinic', 'reseller', 'distributor', 'other');--> statement-breakpoint
CREATE TYPE "public"."batch_status" AS ENUM('pending', 'released', 'quarantined');--> statement-breakpoint
CREATE TYPE "public"."test_type" AS ENUM('purity', 'endotoxin', 'sterility', 'heavyMetals');--> statement-breakpoint
CREATE TYPE "public"."order_channel" AS ENUM('retail', 'wholesale');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending', 'awaiting_payment', 'confirmed', 'shipped', 'failed', 'expired', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('crypto_btc', 'crypto_usdc', 'ach', 'wire', 'zelle');--> statement-breakpoint
CREATE TYPE "public"."payment_record_status" AS ENUM('pending', 'confirmed', 'expired', 'failed');--> statement-breakpoint
CREATE TYPE "public"."reviewer_platform" AS ENUM('reddit', 'discord', 'other');--> statement-breakpoint
CREATE TYPE "public"."reviewer_submission_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."subscription_event_type" AS ENUM('created', 'skipped', 'cancelled', 'renewed', 'paused', 'resumed');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'paused', 'cancelled');--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"name" text NOT NULL,
	"concentration" text NOT NULL,
	"size_ml" real NOT NULL,
	"price_cents" integer NOT NULL,
	"retail_price_cents" integer,
	"sku" text NOT NULL,
	"unit_type" "unit_type" DEFAULT 'vial' NOT NULL,
	"vials_per_unit" integer DEFAULT 1 NOT NULL,
	"in_stock" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "product_variants_sku_unique" UNIQUE("sku")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"category" "category" DEFAULT 'other' NOT NULL,
	"sourcing_path" "sourcing_path",
	"short_description" text NOT NULL,
	"long_description" text DEFAULT '' NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"image_url" text,
	"published" boolean DEFAULT true NOT NULL,
	"compliance_status" "compliance_status" DEFAULT 'cleared' NOT NULL,
	"research_uses" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "products_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "price_list_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"price_tier_id" integer NOT NULL,
	"variant_id" integer NOT NULL,
	"price_cents" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_tiers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"discount_bps" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "price_tiers_slug_unique" UNIQUE("slug"),
	CONSTRAINT "price_tiers_discount_bps_range" CHECK ("price_tiers"."discount_bps" >= 0 AND "price_tiers"."discount_bps" <= 9000)
);
--> statement-breakpoint
CREATE TABLE "admin_sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"admin_user_id" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "admin_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "customer_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"business_name" text NOT NULL,
	"contact_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"tax_id" text,
	"resale_cert_url" text,
	"status" "account_status" DEFAULT 'pending' NOT NULL,
	"business_type" "business_type",
	"price_tier_id" integer,
	"customer_user_id" text NOT NULL,
	"kyb_notes" text,
	"approved_at" timestamp,
	"approved_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"customer_user_id" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"password_set_at" timestamp,
	"name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "customer_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"customer_user_id" text NOT NULL,
	"purpose" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "batches" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"status" "batch_status" DEFAULT 'pending' NOT NULL,
	"production_date" timestamp DEFAULT now() NOT NULL,
	"is_demo" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coa_results" (
	"id" text PRIMARY KEY NOT NULL,
	"batch_id" text NOT NULL,
	"test_type" "test_type" NOT NULL,
	"purity_percent" real,
	"endotoxin_eu_per_ml" real,
	"sterility_pass" boolean,
	"heavy_metals" jsonb,
	"lab_name" text DEFAULT 'Janoshik Analytical' NOT NULL,
	"tested_at" timestamp DEFAULT now() NOT NULL,
	"janoshik_task_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"line_items" jsonb NOT NULL,
	"subtotal_cents" integer NOT NULL,
	"discount_cents" integer DEFAULT 0 NOT NULL,
	"discount_source" text,
	"discount_code" text,
	"discount_code_id" integer,
	"promo_discount_cents" integer DEFAULT 0 NOT NULL,
	"crypto_discount_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer NOT NULL,
	"payment_method" "payment_method" NOT NULL,
	"channel" "order_channel" DEFAULT 'retail' NOT NULL,
	"account_id" text,
	"customer_user_id" text,
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"shipping_name" text NOT NULL,
	"shipping_email" text NOT NULL,
	"shipping_address1" text NOT NULL,
	"shipping_address2" text,
	"shipping_city" text NOT NULL,
	"shipping_state" text NOT NULL,
	"shipping_zip" text NOT NULL,
	"shipping_country" text DEFAULT 'US' NOT NULL,
	"tracking_number" text,
	"carrier" text,
	"shipped_at" timestamp,
	"recovery_emailed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_records" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"btcpay_invoice_id" text,
	"currency" text NOT NULL,
	"amount" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"payment_address" text,
	"payment_url" text,
	"method" text,
	"reference_code" text,
	"bank_last4" text,
	"tx_hash" text,
	"confirmed_at" timestamp,
	"expires_at" timestamp NOT NULL,
	"status" "payment_record_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_attestations" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"account_id" text,
	"attestation_version" text NOT NULL,
	"attestation_text" text NOT NULL,
	"ruo_affirmed" boolean NOT NULL,
	"signer_name" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviewer_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"reviewer_handle" text NOT NULL,
	"platform" "reviewer_platform" DEFAULT 'other' NOT NULL,
	"janoshik_task_id" text NOT NULL,
	"product_id" integer NOT NULL,
	"purity_percent" real,
	"notes" text,
	"status" "reviewer_submission_status" DEFAULT 'pending' NOT NULL,
	"admin_notes" text,
	"submitted_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "subscription_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"subscription_id" integer NOT NULL,
	"event_type" "subscription_event_type" NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"occurred_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"interval_days" integer NOT NULL,
	"product_bundle" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"price_per_interval_cents" integer NOT NULL,
	"image_url" text,
	"featured" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_plans_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_email" text NOT NULL,
	"customer_name" text DEFAULT '' NOT NULL,
	"plan_id" integer NOT NULL,
	"status" "subscription_status" DEFAULT 'active' NOT NULL,
	"interval_days" integer NOT NULL,
	"next_billing_date" timestamp NOT NULL,
	"shipping_address" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes" text,
	"access_token" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"show_vial_images" boolean DEFAULT true NOT NULL,
	"crypto_discount_bps" integer DEFAULT 1000 NOT NULL,
	"fulfillment_email" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discount_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"percent_bps" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp,
	"max_uses" integer,
	"times_used" integer DEFAULT 0 NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "discount_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "payment_methods" (
	"method" text PRIMARY KEY NOT NULL,
	"enabled_retail" boolean DEFAULT false NOT NULL,
	"enabled_wholesale" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_list_entries" ADD CONSTRAINT "price_list_entries_price_tier_id_price_tiers_id_fk" FOREIGN KEY ("price_tier_id") REFERENCES "public"."price_tiers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_list_entries" ADD CONSTRAINT "price_list_entries_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_accounts" ADD CONSTRAINT "customer_accounts_price_tier_id_price_tiers_id_fk" FOREIGN KEY ("price_tier_id") REFERENCES "public"."price_tiers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_accounts" ADD CONSTRAINT "customer_accounts_customer_user_id_customer_users_id_fk" FOREIGN KEY ("customer_user_id") REFERENCES "public"."customer_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_sessions" ADD CONSTRAINT "customer_sessions_customer_user_id_customer_users_id_fk" FOREIGN KEY ("customer_user_id") REFERENCES "public"."customer_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_customer_user_id_customer_users_id_fk" FOREIGN KEY ("customer_user_id") REFERENCES "public"."customer_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coa_results" ADD CONSTRAINT "coa_results_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_discount_code_id_discount_codes_id_fk" FOREIGN KEY ("discount_code_id") REFERENCES "public"."discount_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_account_id_customer_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."customer_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_user_id_customer_users_id_fk" FOREIGN KEY ("customer_user_id") REFERENCES "public"."customer_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_attestations" ADD CONSTRAINT "order_attestations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_attestations" ADD CONSTRAINT "order_attestations_account_id_customer_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."customer_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviewer_submissions" ADD CONSTRAINT "reviewer_submissions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "price_list_entries_tier_variant_uq" ON "price_list_entries" USING btree ("price_tier_id","variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_accounts_customer_user_id_unique" ON "customer_accounts" USING btree ("customer_user_id");