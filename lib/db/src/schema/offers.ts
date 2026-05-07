import {
  pgTable,
  serial,
  text,
  real,
  integer,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { listingsTable } from "./listings";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const offerStatusEnum = pgEnum("offer_status", [
  "pending",
  "accepted",
  "declined",
  "countered",
  "completed",
  "expired",
  "cancelled",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "completed",
  "failed",
  "refunded",
  "in_escrow",
]);

// ─── Offers ───────────────────────────────────────────────────────────────────

export const offersTable = pgTable("offers", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id")
    .notNull()
    .references(() => listingsTable.id, { onDelete: "cascade" }),
  buyerId: integer("buyer_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  sellerId: integer("seller_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  amount: real("amount").notNull(),
  counterAmount: real("counter_amount"),
  status: offerStatusEnum("status").notNull().default("pending"),
  buyerMessage: text("buyer_message"),
  sellerMessage: text("seller_message"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertOfferSchema = createInsertSchema(offersTable).omit({ id: true });
export type InsertOffer = z.infer<typeof insertOfferSchema>;
export type Offer = typeof offersTable.$inferSelect;

// ─── Purchases ────────────────────────────────────────────────────────────────

export const purchasesTable = pgTable("purchases", {
  id: serial("id").primaryKey(),
  offerId: integer("offer_id").references(() => offersTable.id),
  listingId: integer("listing_id")
    .notNull()
    .references(() => listingsTable.id),
  buyerId: integer("buyer_id")
    .notNull()
    .references(() => usersTable.id),
  sellerId: integer("seller_id")
    .notNull()
    .references(() => usersTable.id),
  amount: real("amount").notNull(),
  platformFee: real("platform_fee").notNull().default(0),
  sellerPayout: real("seller_payout").notNull().default(0),
  paymentMethod: text("payment_method"),
  paymentStatus: paymentStatusEnum("payment_status").notNull().default("pending"),
  receiptNumber: text("receipt_number").unique(),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPurchaseSchema = createInsertSchema(purchasesTable).omit({ id: true });
export type InsertPurchase = z.infer<typeof insertPurchaseSchema>;
export type Purchase = typeof purchasesTable.$inferSelect;
