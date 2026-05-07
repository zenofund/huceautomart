import {
  pgTable,
  text,
  real,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

// Generic finance settings table (key/value) so Admin can change platform fees
// without needing code changes for every new percentage setting.
export const financeSettingsTable = pgTable("finance_settings", {
  key: text("key").primaryKey(),
  value: real("value").notNull(),
  updatedBy: integer("updated_by").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertFinanceSettingSchema = createInsertSchema(financeSettingsTable);
export type InsertFinanceSetting = z.infer<typeof insertFinanceSettingSchema>;
export type FinanceSetting = typeof financeSettingsTable.$inferSelect;

