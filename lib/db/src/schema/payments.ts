import {
  pgTable,
  serial,
  text,
  real,
  integer,
  timestamp,
  json,
  pgEnum,
  uniqueIndex,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { listingsTable } from "./listings";
import { inspectionsTable } from "./inspections";
import { subscriptionPlansTable } from "./subscriptions";

// ─── Enums ────────────────────────────────────────────────────────────────────

// `purpose` distinguishes what a payment funded so the verify-handler can
// route the credit to the right place (wallet, inspection, listing escrow).
export const paymentIntentPurposeEnum = pgEnum("payment_intent_purpose", [
  "wallet_topup",
  "inspection",
  "listing_purchase",
  "subscription",
]);

export const paymentIntentStatusEnum = pgEnum("payment_intent_status", [
  "initialized",
  "success",
  "failed",
  "abandoned",
]);

// ─── Bank Accounts (Paystack-resolved) ──────────────────────────────────────
// Buyers/sellers/inspectors save verified bank accounts here. The
// account_name is filled in by Paystack's resolve endpoint, so we never
// trust user-supplied names. (user_id, bank_code, account_number) is unique
// to avoid duplicates.

export const bankAccountsTable = pgTable(
  "bank_accounts",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    bankCode: text("bank_code").notNull(),
    bankName: text("bank_name").notNull(),
    accountNumber: text("account_number").notNull(),
    accountName: text("account_name").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    uniqUserBankAccount: uniqueIndex("bank_accounts_user_bank_account_uniq").on(
      t.userId,
      t.bankCode,
      t.accountNumber,
    ),
  }),
);

export const insertBankAccountSchema = createInsertSchema(bankAccountsTable).omit({ id: true });
export type InsertBankAccount = z.infer<typeof insertBankAccountSchema>;
export type BankAccount = typeof bankAccountsTable.$inferSelect;

// ─── Payment Intents (Paystack transactions) ────────────────────────────────
// Every Paystack-initialized transaction gets a row here keyed by the
// Paystack `reference`. The verify endpoint and webhook both look it up by
// reference and use `purpose` + `inspectionId`/`listingId` to apply the
// effect (credit wallet, mark inspection paid, mark purchase escrowed) in a
// single transaction together with idempotent status flips.

export const paymentIntentsTable = pgTable("payment_intents", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  reference: text("reference").notNull().unique(),
  purpose: paymentIntentPurposeEnum("purpose").notNull(),
  amount: real("amount").notNull(),
  status: paymentIntentStatusEnum("status").notNull().default("initialized"),
  inspectionId: integer("inspection_id").references(() => inspectionsTable.id, {
    onDelete: "set null",
  }),
  listingId: integer("listing_id").references(() => listingsTable.id, {
    onDelete: "set null",
  }),
  planId: integer("plan_id").references(() => subscriptionPlansTable.id, {
    onDelete: "set null",
  }),
  authorizationUrl: text("authorization_url"),
  channel: text("channel"),
  paidAt: timestamp("paid_at"),
  paystackResponse: json("paystack_response").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPaymentIntentSchema = createInsertSchema(paymentIntentsTable).omit({ id: true });
export type InsertPaymentIntent = z.infer<typeof insertPaymentIntentSchema>;
export type PaymentIntent = typeof paymentIntentsTable.$inferSelect;
