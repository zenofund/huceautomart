import { db, notificationsTable, usersTable } from "@workspace/db";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";

type NotificationType = typeof notificationsTable.$inferInsert["type"];
type NotificationPriority = typeof notificationsTable.$inferInsert["priority"];
type TargetRole = "all" | "buyer" | "seller" | "inspector" | "admin";

interface NotifyInput {
  userId: number;
  type: NotificationType;
  title: string;
  message: string;
  entityType?: string;
  entityId?: number;
  priority?: NotificationPriority;
  data?: Record<string, unknown>;
}

export async function createNotification(input: NotifyInput) {
  const [row] = await db
    .insert(notificationsTable)
    .values({
      userId: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      priority: input.priority ?? "normal",
      data: input.data ?? null,
    })
    .returning();
  return row;
}

export async function createBulkNotifications(
  userIds: number[],
  payload: Omit<NotifyInput, "userId">,
) {
  if (userIds.length === 0) return [];
  const rows = await db
    .insert(notificationsTable)
    .values(
      userIds.map((userId) => ({
        userId,
        type: payload.type,
        title: payload.title,
        message: payload.message,
        entityType: payload.entityType ?? null,
        entityId: payload.entityId ?? null,
        priority: payload.priority ?? "normal",
        data: payload.data ?? null,
      })),
    )
    .returning();
  return rows;
}

export async function createRoleNotifications(
  targetRole: TargetRole,
  payload: Omit<NotifyInput, "userId">,
) {
  const roleWhere =
    targetRole === "all"
      ? inArray(usersTable.role, ["buyer", "seller", "inspector", "admin"])
      : eq(usersTable.role, targetRole);
  const users = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(
      and(
        roleWhere,
        or(isNull(usersTable.suspendedUntil), sql`${usersTable.suspendedUntil} < now()`)!,
      ),
    );
  return createBulkNotifications(
    users.map((u) => u.id),
    payload,
  );
}

export async function listNotificationsForUser(userId: number, limit = 20, unreadOnly = false) {
  const rows = await db
    .select()
    .from(notificationsTable)
    .where(
      and(
        eq(notificationsTable.userId, userId),
        unreadOnly ? eq(notificationsTable.isRead, false) : undefined,
      ),
    )
    .orderBy(desc(notificationsTable.createdAt))
    .limit(Math.min(100, Math.max(1, limit)));
  return rows;
}

export async function getUnreadCount(userId: number) {
  const [row] = await db
    .select({
      count: sql<number>`COALESCE(COUNT(*), 0)::int`,
    })
    .from(notificationsTable)
    .where(and(eq(notificationsTable.userId, userId), eq(notificationsTable.isRead, false)));
  return Number(row?.count ?? 0);
}
