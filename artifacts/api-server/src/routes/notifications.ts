import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db, notificationsTable } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../lib/auth-middleware";
import {
  getUnreadCount,
  listNotificationsForUser,
} from "../lib/notifications";

const router = Router();

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
