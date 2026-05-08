import { db, notificationsTable, usersTable, notificationDevicesTable } from "@workspace/db";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { Expo, ExpoPushMessage } from "expo-server-sdk";

// Create a new Expo SDK client
const expo = new Expo();

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

function resolvePath(type?: string | null, entityType?: string | null, entityId?: number | null, userRole?: string | null): string {
  if (!entityType || !entityId) {
    return "/notifications";
  }
  
  switch (entityType) {
    case "offer":
      return userRole === "seller" ? `/seller/offers` : `/dashboard/activity/offer/${entityId}`;
    case "inspection":
      return userRole === "inspector" ? `/inspector/inspections/${entityId}` : `/dashboard/activity/inspection/${entityId}`;
    case "purchase":
      return userRole === "seller" ? `/seller/wallet` : `/dashboard/activity`;
    case "message":
      return userRole === "seller" ? `/seller/messages/${entityId}` : `/dashboard/messages/${entityId}`;
    case "listing":
      return userRole === "admin" ? `/admin/inventory/${entityId}` : `/seller/listings/${entityId}`;
    default:
      return `/notifications`;
  }
}

async function sendPushNotification(userId: number, title: string, message: string, data: Record<string, unknown>) {
  try {
    const devices = await db
      .select({ token: notificationDevicesTable.expoPushToken })
      .from(notificationDevicesTable)
      .where(
        and(
          eq(notificationDevicesTable.userId, userId),
          eq(notificationDevicesTable.isActive, true)
        )
      );

    if (devices.length === 0) return;

    const messages: ExpoPushMessage[] = [];
    for (const device of devices) {
      if (!Expo.isExpoPushToken(device.token)) continue;
      messages.push({
        to: device.token,
        sound: "default",
        title,
        body: message,
        data,
      });
    }

    if (messages.length === 0) return;

    const chunks = expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      // Send asynchronously without blocking the main request
      expo.sendPushNotificationsAsync(chunk).catch(err => {
        console.error("Error sending push notification chunk:", err);
      });
    }
  } catch (error) {
    console.error("Failed to send push notifications:", error);
  }
}

export async function createNotification(input: NotifyInput) {
  // 1. Fetch user role for path resolution
  const [user] = await db
    .select({ role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.id, input.userId))
    .limit(1);

  // 2. Resolve target path
  const path = resolvePath(input.type, input.entityType, input.entityId, user?.role);
  
  // 3. Inject path into data
  const data = { ...(input.data || {}), path };

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
      data,
    })
    .returning();

  // Fire native push notifications
  sendPushNotification(input.userId, input.title, input.message, data);

  return row;
}

export async function createBulkNotifications(
  userIds: number[],
  payload: Omit<NotifyInput, "userId">,
) {
  if (userIds.length === 0) return [];

  // 1. Fetch user roles for path resolution
  const users = await db
    .select({ id: usersTable.id, role: usersTable.role })
    .from(usersTable)
    .where(inArray(usersTable.id, userIds));

  const roleMap = new Map(users.map(u => [u.id, u.role]));

  // 2. Prepare payload with specific resolved paths
  const valuesToInsert = userIds.map((userId) => {
    const userRole = roleMap.get(userId);
    const path = resolvePath(payload.type, payload.entityType, payload.entityId, userRole);
    const data = { ...(payload.data || {}), path };

    return {
      userId,
      type: payload.type,
      title: payload.title,
      message: payload.message,
      entityType: payload.entityType ?? null,
      entityId: payload.entityId ?? null,
      priority: payload.priority ?? "normal",
      data,
    };
  });

  const rows = await db
    .insert(notificationsTable)
    .values(valuesToInsert)
    .returning();

  // 3. Fire push notifications for all users
  db.select({ userId: notificationDevicesTable.userId, token: notificationDevicesTable.expoPushToken })
    .from(notificationDevicesTable)
    .where(
      and(
        inArray(notificationDevicesTable.userId, userIds),
        eq(notificationDevicesTable.isActive, true)
      )
    )
    .then(devices => {
      const messages: ExpoPushMessage[] = [];
      const userToDataMap = new Map(valuesToInsert.map(v => [v.userId, v.data]));

      for (const device of devices) {
        if (!Expo.isExpoPushToken(device.token)) continue;
        messages.push({
          to: device.token,
          sound: "default",
          title: payload.title,
          body: payload.message,
          data: userToDataMap.get(device.userId) || {},
        });
      }

      if (messages.length > 0) {
        const chunks = expo.chunkPushNotifications(messages);
        for (const chunk of chunks) {
          expo.sendPushNotificationsAsync(chunk).catch(console.error);
        }
      }
    })
    .catch(console.error);

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
