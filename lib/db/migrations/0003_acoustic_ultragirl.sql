ALTER TABLE "coa_documents" ALTER COLUMN "batch_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "coa_documents" ADD COLUMN "variant_id" integer;--> statement-breakpoint
ALTER TABLE "coa_documents" ADD COLUMN "purity_percent" real;--> statement-breakpoint
ALTER TABLE "coa_documents" ADD COLUMN "endotoxin_eu_per_ml" real;--> statement-breakpoint
ALTER TABLE "coa_documents" ADD COLUMN "sterility_pass" boolean;--> statement-breakpoint
ALTER TABLE "coa_documents" ADD COLUMN "lab_name" text;--> statement-breakpoint
ALTER TABLE "coa_documents" ADD COLUMN "tested_at" timestamp;--> statement-breakpoint
ALTER TABLE "coa_documents" ADD CONSTRAINT "coa_documents_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coa_documents" ADD CONSTRAINT "coa_documents_one_owner" CHECK (("coa_documents"."batch_id" IS NOT NULL AND "coa_documents"."variant_id" IS NULL) OR ("coa_documents"."batch_id" IS NULL AND "coa_documents"."variant_id" IS NOT NULL));