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
import { listingsTable } from "./listings";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const inspectionStatusEnum = pgEnum("inspection_status", [
  "pending",
  "assigned",
  "active",
  "completed",
  "cancelled",
]);

export const conditionRatingEnum = pgEnum("condition_rating", [
  "excellent",
  "good",
  "fair",
  "poor",
]);

// ─── Inspection Types ─────────────────────────────────────────────────────────

export const inspectionTypesTable = pgTable("inspection_types", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  price: real("price").notNull(),
  durationHours: integer("duration_hours").notNull().default(2),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertInspectionTypeSchema = createInsertSchema(inspectionTypesTable).omit({ id: true });
export type InsertInspectionType = z.infer<typeof insertInspectionTypeSchema>;
export type InspectionType = typeof inspectionTypesTable.$inferSelect;

// ─── Inspections ──────────────────────────────────────────────────────────────

export const inspectionsTable = pgTable("inspections", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id")
    .notNull()
    .references(() => listingsTable.id, { onDelete: "cascade" }),
  buyerId: integer("buyer_id")
    .notNull()
    .references(() => usersTable.id),
  inspectorId: integer("inspector_id").references(() => usersTable.id),
  inspectionTypeId: integer("inspection_type_id")
    .notNull()
    .references(() => inspectionTypesTable.id),
  status: inspectionStatusEnum("status").notNull().default("pending"),
  paidAt: timestamp("paid_at"),
  scheduledAt: timestamp("scheduled_at"),
  completedAt: timestamp("completed_at"),
  inspectionLocation: text("inspection_location"),
  notes: text("notes"),
  buyerNotes: text("buyer_notes"),
  fee: real("fee").notNull().default(0),
  inspectorEarnings: real("inspector_earnings").notNull().default(0),
  platformFee: real("platform_fee").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertInspectionSchema = createInsertSchema(inspectionsTable).omit({ id: true });
export type InsertInspection = z.infer<typeof insertInspectionSchema>;
export type Inspection = typeof inspectionsTable.$inferSelect;

// ─── Inspection Reports ───────────────────────────────────────────────────────

export const inspectionReportsTable = pgTable("inspection_reports", {
  id: serial("id").primaryKey(),
  inspectionId: integer("inspection_id")
    .notNull()
    .unique()
    .references(() => inspectionsTable.id, { onDelete: "cascade" }),
  inspectorId: integer("inspector_id")
    .notNull()
    .references(() => usersTable.id),
  overallCondition: conditionRatingEnum("overall_condition").notNull(),
  summary: text("summary").notNull(),
  bodyCondition: conditionRatingEnum("body_condition"),
  engineCondition: conditionRatingEnum("engine_condition"),
  interiorCondition: conditionRatingEnum("interior_condition"),
  electricalCondition: conditionRatingEnum("electrical_condition"),
  suspensionCondition: conditionRatingEnum("suspension_condition"),
  tyreCondition: conditionRatingEnum("tyre_condition"),
  documentsVerified: boolean("documents_verified").notNull().default(false),
  odometerVerified: boolean("odometer_verified").notNull().default(false),
  vinVerified: boolean("vin_verified").notNull().default(false),
  recommendedActions: text("recommended_actions"),
  reportDetails: json("report_details").$type<Record<string, unknown>>(),
  images: json("images").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertInspectionReportSchema = createInsertSchema(inspectionReportsTable).omit({ id: true });
export type InsertInspectionReport = z.infer<typeof insertInspectionReportSchema>;
export type InspectionReport = typeof inspectionReportsTable.$inferSelect;
