import {
  pgEnum,
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  boolean,
  json,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const notificationPriorityEnum = pgEnum("notification_priority", [
  "critical",
  "high",
  "normal",
]);

export const notificationTypeEnum = pgEnum("notification_type", [
  "offer_created",
  "offer_countered",
  "offer_accepted",
  "offer_declined",
  "offer_cancelled",
  "inspection_submitted",
  "purchase_paid",
  "purchase_confirmed",
  "purchase_cancelled",
  "purchase_disputed",
  "admin_announcement",
  "system",
]);

export const notificationsTable = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    type: notificationTypeEnum("type").notNull().default("system"),
    title: text("title").notNull(),
    message: text("message").notNull(),
    entityType: text("entity_type"),
    entityId: integer("entity_id"),
    priority: notificationPriorityEnum("priority").notNull().default("normal"),
    isRead: boolean("is_read").notNull().default(false),
    readAt: timestamp("read_at"),
    data: json("data").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("notifications_user_created_idx").on(table.userId, table.createdAt),
    index("notifications_user_read_idx").on(table.userId, table.isRead),
  ],
);

export const insertNotificationSchema = createInsertSchema(notificationsTable).omit({
  id: true,
});
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notificationsTable.$inferSelect;
