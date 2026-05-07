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
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const listingStatusEnum = pgEnum("listing_status", [
  "active",
  "sold",
  "pending",
  "deleted",
  "suspended",
]);

export const conditionEnum = pgEnum("condition", [
  "new",
  "used",
  "certified_pre_owned",
]);

// ─── Car Categories ───────────────────────────────────────────────────────────

export const carCategoriesTable = pgTable("car_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  imageUrl: text("image_url"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertCarCategorySchema = createInsertSchema(carCategoriesTable).omit({ id: true });
export type InsertCarCategory = z.infer<typeof insertCarCategorySchema>;
export type CarCategory = typeof carCategoriesTable.$inferSelect;

// ─── Car Features ─────────────────────────────────────────────────────────────

export const carFeaturesTable = pgTable("car_features", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  icon: text("icon"),
  featureGroup: text("feature_group"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCarFeatureSchema = createInsertSchema(carFeaturesTable).omit({ id: true });
export type InsertCarFeature = z.infer<typeof insertCarFeatureSchema>;
export type CarFeature = typeof carFeaturesTable.$inferSelect;

// ─── Listings (Cars) ──────────────────────────────────────────────────────────

export const listingsTable = pgTable("listings", {
  id: serial("id").primaryKey(),
  sellerId: integer("seller_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  categoryId: integer("category_id").references(() => carCategoriesTable.id),
  title: text("title"),
  make: text("make").notNull(),
  model: text("model").notNull(),
  year: integer("year").notNull(),
  price: real("price").notNull(),
  negotiable: boolean("negotiable").notNull().default(true),
  condition: conditionEnum("condition").notNull().default("used"),
  location: text("location").notNull(),
  mileage: integer("mileage").notNull().default(0),
  color: text("color"),
  carType: text("car_type"),
  transmission: text("transmission"),
  fuelType: text("fuel_type"),
  driveType: text("drive_type"),
  doors: integer("doors"),
  seats: integer("seats"),
  engineSize: text("engine_size"),
  horsepower: integer("horsepower"),
  vin: text("vin"),
  description: text("description"),
  status: listingStatusEnum("status").notNull().default("active"),
  isFeatured: boolean("is_featured").notNull().default(false),
  viewCount: integer("view_count").notNull().default(0),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertListingSchema = createInsertSchema(listingsTable).omit({ id: true });
export type InsertListing = z.infer<typeof insertListingSchema>;
export type Listing = typeof listingsTable.$inferSelect;

// ─── Listing Images ───────────────────────────────────────────────────────────

export const mediaTypeEnum = pgEnum("listing_media_type", ["image", "video"]);

export const listingImagesTable = pgTable("listing_images", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id")
    .notNull()
    .references(() => listingsTable.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  mediaType: mediaTypeEnum("media_type").notNull().default("image"),
  fileName: text("file_name"),
  fileSize: integer("file_size"),
  displayOrder: integer("display_order").notNull().default(0),
  isPrimary: boolean("is_primary").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertListingImageSchema = createInsertSchema(listingImagesTable).omit({ id: true });
export type InsertListingImage = z.infer<typeof insertListingImageSchema>;
export type ListingImage = typeof listingImagesTable.$inferSelect;

// ─── Listing Feature Links (Many-to-Many) ────────────────────────────────────

export const listingFeatureLinksTable = pgTable("listing_feature_links", {
  listingId: integer("listing_id")
    .notNull()
    .references(() => listingsTable.id, { onDelete: "cascade" }),
  featureId: integer("feature_id")
    .notNull()
    .references(() => carFeaturesTable.id, { onDelete: "cascade" }),
});

export type ListingFeatureLink = typeof listingFeatureLinksTable.$inferSelect;

// ─── Listing Deletion Requests ───────────────────────────────────────────────

export const deletionRequestStatusEnum = pgEnum("deletion_request_status", [
  "pending",
  "approved",
  "rejected",
]);

export const listingDeletionRequestsTable = pgTable("listing_deletion_requests", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id")
    .notNull()
    .references(() => listingsTable.id, { onDelete: "cascade" }),
  sellerId: integer("seller_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  reason: text("reason"),
  status: deletionRequestStatusEnum("status").notNull().default("pending"),
  decidedBy: integer("decided_by").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  decidedAt: timestamp("decided_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ListingDeletionRequest = typeof listingDeletionRequestsTable.$inferSelect;

// ─── Saved Vehicles ───────────────────────────────────────────────────────────

export const savedVehiclesTable = pgTable(
  "saved_vehicles",
  {
    id: serial("id").primaryKey(),
    buyerId: integer("buyer_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    listingId: integer("listing_id")
      .notNull()
      .references(() => listingsTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    // A buyer can only save a listing once. The POST endpoint relies on this
    // index for ON CONFLICT DO NOTHING to enforce true idempotency.
    buyerListingUnique: uniqueIndex("saved_vehicles_buyer_listing_unique").on(
      t.buyerId,
      t.listingId,
    ),
  }),
);

export const insertSavedVehicleSchema = createInsertSchema(savedVehiclesTable).omit({ id: true });
export type InsertSavedVehicle = z.infer<typeof insertSavedVehicleSchema>;
export type SavedVehicle = typeof savedVehiclesTable.$inferSelect;

// ─── Car View History ─────────────────────────────────────────────────────────

export const carViewHistoryTable = pgTable("car_view_history", {
  id: serial("id").primaryKey(),
  viewerId: integer("viewer_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  listingId: integer("listing_id")
    .notNull()
    .references(() => listingsTable.id, { onDelete: "cascade" }),
  viewedAt: timestamp("viewed_at").notNull().defaultNow(),
});

export const insertCarViewHistorySchema = createInsertSchema(carViewHistoryTable).omit({ id: true });
export type InsertCarViewHistory = z.infer<typeof insertCarViewHistorySchema>;
export type CarViewHistory = typeof carViewHistoryTable.$inferSelect;

// ─── Delete Requests (Admin approval flow) ────────────────────────────────────

export const deleteListingRequestsTable = pgTable("delete_listing_requests", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id")
    .notNull()
    .references(() => listingsTable.id, { onDelete: "cascade" }),
  requestedBy: integer("requested_by")
    .notNull()
    .references(() => usersTable.id),
  reason: text("reason"),
  status: text("status").notNull().default("pending"),
  reviewedBy: integer("reviewed_by").references(() => usersTable.id),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertDeleteListingRequestSchema = createInsertSchema(deleteListingRequestsTable).omit({ id: true });
export type InsertDeleteListingRequest = z.infer<typeof insertDeleteListingRequestSchema>;
export type DeleteListingRequest = typeof deleteListingRequestsTable.$inferSelect;
