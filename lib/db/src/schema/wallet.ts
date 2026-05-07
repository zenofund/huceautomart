import {
  pgTable,
  serial,
  text,
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

export const transactionTypeEnum = pgEnum("transaction_type", [
  "deposit",
  "withdrawal",
  "payment",
  "receipt",
  "commission",
  "refund",
  "inspection_fee",
  "inspection_earning",
]);

export const transactionStatusEnum = pgEnum("transaction_status", [
  "pending",
  "completed",
  "failed",
  "reversed",
]);

// ─── Wallet Accounts ──────────────────────────────────────────────────────────

export const walletAccountsTable = pgTable("wallet_accounts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .unique()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  balance: real("balance").notNull().default(0),
  currency: text("currency").notNull().default("NGN"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertWalletAccountSchema = createInsertSchema(walletAccountsTable).omit({ id: true });
export type InsertWalletAccount = z.infer<typeof insertWalletAccountSchema>;
export type WalletAccount = typeof walletAccountsTable.$inferSelect;

// ─── Wallet Transactions ──────────────────────────────────────────────────────

export const walletTransactionsTable = pgTable("wallet_transactions", {
  id: serial("id").primaryKey(),
  walletId: integer("wallet_id")
    .notNull()
    .references(() => walletAccountsTable.id, { onDelete: "cascade" }),
  type: transactionTypeEnum("type").notNull(),
  amount: real("amount").notNull(),
  status: transactionStatusEnum("status").notNull().default("pending"),
  reference: text("reference").unique(),
  description: text("description"),
  balanceBefore: real("balance_before"),
  balanceAfter: real("balance_after"),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertWalletTransactionSchema = createInsertSchema(walletTransactionsTable).omit({ id: true });
export type InsertWalletTransaction = z.infer<typeof insertWalletTransactionSchema>;
export type WalletTransaction = typeof walletTransactionsTable.$inferSelect;
