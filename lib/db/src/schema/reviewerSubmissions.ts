import {
  pgTable,
  serial,
  text,
  integer,
  real,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productsTable } from "./products";

export const reviewerPlatformEnum = pgEnum("reviewer_platform", [
  "reddit",
  "discord",
  "other",
]);

export const reviewerSubmissionStatusEnum = pgEnum(
  "reviewer_submission_status",
  ["pending", "approved", "rejected"]
);

export const reviewerSubmissionsTable = pgTable("reviewer_submissions", {
  id: serial("id").primaryKey(),
  reviewerHandle: text("reviewer_handle").notNull(),
  platform: reviewerPlatformEnum("platform").notNull().default("other"),
  janoshikTaskId: text("janoshik_task_id").notNull(),
  productId: integer("product_id")
    .notNull()
    .references(() => productsTable.id, { onDelete: "restrict" }),
  purityPercent: real("purity_percent"),
  notes: text("notes"),
  status: reviewerSubmissionStatusEnum("status").notNull().default("pending"),
  adminNotes: text("admin_notes"),
  submittedAt: timestamp("submitted_at").notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
});

export const insertReviewerSubmissionSchema = createInsertSchema(
  reviewerSubmissionsTable
).omit({ id: true, submittedAt: true, reviewedAt: true, status: true });

export type InsertReviewerSubmission = z.infer<
  typeof insertReviewerSubmissionSchema
>;
export type ReviewerSubmission = typeof reviewerSubmissionsTable.$inferSelect;
