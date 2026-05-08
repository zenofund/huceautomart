import { Router } from "express";
import { and, eq, sql } from "drizzle-orm";
import { db, notificationsTable } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../lib/auth-middleware";
import {
  getUnreadCount,
  listNotificationsForUser,
} from "../lib/notifications";
import { z } from "zod/v4";

const router = Router();

const registerPushTokenSchema = z.object({
  expoPushToken: z.string().min(1, "Expo push token is required"),
  deviceId: z.string().min(1).optional(),
  platform: z.enum(["ios", "android"]),
  appVersion: z.string().min(1).optional(),
});

router.post("/notifications/push-token", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const payload = registerPushTokenSchema.parse(req.body ?? {});

    const existingByTokenResult = await db.execute(
      sql`select id from notification_devices where expo_push_token = ${payload.expoPushToken} limit 1`,
    );
    const existingByToken = existingByTokenResult.rows[0] as { id: number } | undefined;

    if (existingByToken) {
      const updatedResult = await db.execute(
        sql`
          update notification_devices
          set
            user_id = ${userId},
            device_id = ${payload.deviceId ?? null},
            platform = ${payload.platform},
            app_version = ${payload.appVersion ?? null},
            is_active = true,
            last_seen_at = now(),
            updated_at = now()
          where id = ${existingByToken.id}
          returning id
        `,
      );
      const updated = updatedResult.rows[0] as { id: number } | undefined;
      res.json({ ok: true, id: updated?.id ?? existingByToken.id });
      return;
    }

    if (payload.deviceId) {
      const existingByDeviceResult = await db.execute(
        sql`
          select id
          from notification_devices
          where user_id = ${userId} and device_id = ${payload.deviceId}
          limit 1
        `,
      );
      const existingByDevice = existingByDeviceResult.rows[0] as { id: number } | undefined;

      if (existingByDevice) {
        const updatedResult = await db.execute(
          sql`
            update notification_devices
            set
              expo_push_token = ${payload.expoPushToken},
              platform = ${payload.platform},
              app_version = ${payload.appVersion ?? null},
              is_active = true,
              last_seen_at = now(),
              updated_at = now()
            where id = ${existingByDevice.id}
            returning id
          `,
        );
        const updated = updatedResult.rows[0] as { id: number } | undefined;
        res.json({ ok: true, id: updated?.id ?? existingByDevice.id });
        return;
      }
    }

    const createdResult = await db.execute(
      sql`
        insert into notification_devices
          (user_id, expo_push_token, device_id, platform, app_version, is_active)
        values
          (${userId}, ${payload.expoPushToken}, ${payload.deviceId ?? null}, ${payload.platform}, ${payload.appVersion ?? null}, true)
        returning id
      `,
    );
    const created = createdResult.rows[0] as { id: number } | undefined;

    res.status(201).json({ ok: true, id: created?.id });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.issues[0]?.message ?? "Invalid payload" });
      return;
    }
    req.log.error({ err }, "register push token failed");
    res.status(500).json({ error: "Failed to register push token" });
  }
});

router.get("/notifications", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const limit = Number(req.query.limit ?? 20);
    const unreadOnly = String(req.query.unreadOnly ?? "false").toLowerCase() === "true";
    const rows = await listNotificationsForUser(userId, limit, unreadOnly);
    res.json({ items: rows });
  } catch (err) {
    req.log.error({ err }, "list notifications failed");
    res.status(500).json({ error: "Failed to list notifications" });
  }
});

router.get("/notifications/unread-count", requireAuth, async (req: AuthRequest, res) => {
  try {
    const count = await getUnreadCount(req.user!.userId);
    res.json({ count });
  } catch (err) {
    req.log.error({ err }, "unread count failed");
    res.status(500).json({ error: "Failed to fetch unread count" });
  }
});

router.patch("/notifications/:id/read", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid notification id" });
      return;
    }
    const [row] = await db
      .update(notificationsTable)
      .set({ isRead: true, readAt: new Date() })
      .where(
        and(
          eq(notificationsTable.id, id),
          eq(notificationsTable.userId, req.user!.userId),
        ),
      )
      .returning();
    if (!row) {
      res.status(404).json({ error: "Notification not found" });
      return;
    }
    res.json({ notification: row });
  } catch (err) {
    req.log.error({ err }, "mark notification read failed");
    res.status(500).json({ error: "Failed to mark notification as read" });
  }
});

router.patch("/notifications/read-all", requireAuth, async (req: AuthRequest, res) => {
  try {
    await db
      .update(notificationsTable)
      .set({ isRead: true, readAt: new Date() })
      .where(
        and(
          eq(notificationsTable.userId, req.user!.userId),
          eq(notificationsTable.isRead, false),
        ),
      );
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "mark all notifications read failed");
    res.status(500).json({ error: "Failed to mark notifications as read" });
  }
});

export default router;
