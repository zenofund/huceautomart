import {
  pgTable,
  serial,
  text,
  real,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { listingsTable } from "./listings";
import { purchasesTable } from "./offers";
import { inspectionsTable } from "./inspections";

// ─── Reviews / Feedback ───────────────────────────────────────────────────────

export const reviewsTable = pgTable("reviews", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id")
    .notNull()
    .references(() => listingsTable.id, { onDelete: "cascade" }),
  purchaseId: integer("purchase_id").references(() => purchasesTable.id, {
    onDelete: "set null",
  }),
  buyerId: integer("buyer_id")
    .notNull()
    .references(() => usersTable.id),
  sellerId: integer("seller_id")
    .notNull()
    .references(() => usersTable.id),
  rating: real("rating").notNull(),
  comment: text("comment"),
  sellerResponse: text("seller_response"),
  sellerRespondedAt: timestamp("seller_responded_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertReviewSchema = createInsertSchema(reviewsTable).omit({ id: true });
export type InsertReview = z.infer<typeof insertReviewSchema>;
export type Review = typeof reviewsTable.$inferSelect;

// ─── Inspector Reviews ────────────────────────────────────────────────────────

export const inspectorReviewsTable = pgTable("inspector_reviews", {
  id: serial("id").primaryKey(),
  inspectionId: integer("inspection_id")
    .notNull()
    .unique()
    .references(() => inspectionsTable.id, { onDelete: "cascade" }),
  buyerId: integer("buyer_id")
    .notNull()
    .references(() => usersTable.id),
  inspectorId: integer("inspector_id")
    .notNull()
    .references(() => usersTable.id),
  rating: real("rating").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertInspectorReviewSchema = createInsertSchema(inspectorReviewsTable).omit({
  id: true,
});
export type InsertInspectorReview = z.infer<typeof insertInspectorReviewSchema>;
export type InspectorReview = typeof inspectorReviewsTable.$inferSelect;
