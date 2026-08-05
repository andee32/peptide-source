ALTER TYPE "public"."payment_method" ADD VALUE 'pay_by_bank';--> statement-breakpoint
ALTER TABLE "payment_records" ADD COLUMN "link_payment_id" text;--> statement-breakpoint
ALTER TABLE "payment_records" ADD COLUMN "link_customer_id" text;--> statement-breakpoint
ALTER TABLE "payment_records" ADD COLUMN "link_session_key" text;