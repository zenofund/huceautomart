import {
  pgTable,
  serial,
  text,
  boolean,
  real,
  integer,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const userRoleEnum = pgEnum("user_role", [
  "buyer",
  "seller",
  "inspector",
  "admin",
]);

export const accountTypeEnum = pgEnum("account_type", [
  "individual",
  "company",
]);

export const userStatusEnum = pgEnum("user_status", [
  "active",
  "inactive",
  "suspended",
  "pending_verification",
]);

export const verificationStatusEnum = pgEnum("verification_status", [
  "unverified",
  "pending",
  "verified",
  "rejected",
]);

export const otpPurposeEnum = pgEnum("otp_purpose", [
  "email_verify",
  "password_reset",
  "phone_verify",
]);

// ─── Users ────────────────────────────────────────────────────────────────────

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  phone: text("phone"),
  role: userRoleEnum("role").notNull().default("buyer"),
  accountType: accountTypeEnum("account_type").notNull().default("individual"),
  status: userStatusEnum("status").notNull().default("pending_verification"),
  emailVerified: boolean("email_verified").notNull().default(false),
  profilePhotoUrl: text("profile_photo_url"),
  googleId: text("google_id"),
  suspendedUntil: timestamp("suspended_until"),
  lastSeenAt: timestamp("last_seen_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;

// ─── OTP Verifications ────────────────────────────────────────────────────────

export const otpVerificationsTable = pgTable("otp_verifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  otpCode: text("otp_code").notNull(),
  purpose: otpPurposeEnum("purpose").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertOtpVerificationSchema = createInsertSchema(otpVerificationsTable).omit({ id: true });
export type InsertOtpVerification = z.infer<typeof insertOtpVerificationSchema>;
export type OtpVerification = typeof otpVerificationsTable.$inferSelect;

// ─── Seller Profiles ──────────────────────────────────────────────────────────

export const sellerProfilesTable = pgTable("seller_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .unique()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  businessName: text("business_name"),
  lotName: text("lot_name"),
  businessRegNumber: text("business_reg_number"),
  ninNumber: text("nin_number"),
  ninDocumentUrl: text("nin_document_url"),
  proofOfAddressUrl: text("proof_of_address_url"),
  verificationStatus: verificationStatusEnum("verification_status")
    .notNull()
    .default("unverified"),
  isVerified: boolean("is_verified").notNull().default(false),
  bankName: text("bank_name"),
  bankAccountNumber: text("bank_account_number"),
  bankAccountName: text("bank_account_name"),
  rating: real("rating").notNull().default(0),
  totalListings: integer("total_listings").notNull().default(0),
  totalSales: integer("total_sales").notNull().default(0),
  bio: text("bio"),
  location: text("location"),
  website: text("website"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSellerProfileSchema = createInsertSchema(sellerProfilesTable).omit({ id: true });
export type InsertSellerProfile = z.infer<typeof insertSellerProfileSchema>;
export type SellerProfile = typeof sellerProfilesTable.$inferSelect;

// ─── Buyer Profiles ───────────────────────────────────────────────────────────

export const buyerProfilesTable = pgTable("buyer_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .unique()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  businessName: text("business_name"),
  businessRegNumber: text("business_reg_number"),
  billingAddress: text("billing_address"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertBuyerProfileSchema = createInsertSchema(buyerProfilesTable).omit({ id: true });
export type InsertBuyerProfile = z.infer<typeof insertBuyerProfileSchema>;
export type BuyerProfile = typeof buyerProfilesTable.$inferSelect;

// ─── Inspector Profiles ───────────────────────────────────────────────────────

export const inspectorProfilesTable = pgTable("inspector_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .unique()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  licenseNumber: text("license_number"),
  serviceArea: text("service_area"),
  bio: text("bio"),
  officeName: text("office_name"),
  bankName: text("bank_name"),
  bankAccountNumber: text("bank_account_number"),
  bankAccountName: text("bank_account_name"),
  rating: real("rating").notNull().default(0),
  totalInspections: integer("total_inspections").notNull().default(0),
  isAvailable: boolean("is_available").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertInspectorProfileSchema = createInsertSchema(inspectorProfilesTable).omit({ id: true });
export type InsertInspectorProfile = z.infer<typeof insertInspectorProfileSchema>;
export type InspectorProfile = typeof inspectorProfilesTable.$inferSelect;
