import {
  pgTable,
  serial,
  text,
  boolean,
  real,
  integer,
  timestamp,
  json,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "active",
  "expired",
  "cancelled",
]);

// ─── Subscription Plans ───────────────────────────────────────────────────────

export const subscriptionPlansTable = pgTable("subscription_plans", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  price: real("price").notNull(),
  durationDays: integer("duration_days").notNull(),
  maxListings: integer("max_listings").notNull().default(10),
  maxPhotos: integer("max_photos").notNull().default(5),
  featuredListingEnabled: boolean("featured_listing_enabled").notNull().default(false),
  analyticsDashboardEnabled: boolean("analytics_dashboard_enabled").notNull().default(false),
  features: json("features").$type<string[]>().notNull().default([]),
  isFeatured: boolean("is_featured").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSubscriptionPlanSchema = createInsertSchema(subscriptionPlansTable).omit({ id: true });
export type InsertSubscriptionPlan = z.infer<typeof insertSubscriptionPlanSchema>;
export type SubscriptionPlan = typeof subscriptionPlansTable.$inferSelect;

// ─── Active Subscriptions ─────────────────────────────────────────────────────

export const subscriptionsTable = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  sellerId: integer("seller_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  planId: integer("plan_id")
    .notNull()
    .references(() => subscriptionPlansTable.id),
  status: subscriptionStatusEnum("status").notNull().default("active"),
  startsAt: timestamp("starts_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSubscriptionSchema = createInsertSchema(subscriptionsTable).omit({ id: true });
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type Subscription = typeof subscriptionsTable.$inferSelect;
