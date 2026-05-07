import { Router } from "express";
import { sseSubscribe, sseUnsubscribe, sseBroadcast } from "../lib/sse";
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  conversationsTable,
  conversationParticipantsTable,
  messagesTable,
  usersTable,
  listingsTable,
} from "@workspace/db";
import { requireAuth, type AuthRequest } from "../lib/auth-middleware";

const router = Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function assertParticipant(conversationId: number, userId: number) {
  const row = await db
    .select({ userId: conversationParticipantsTable.userId })
    .from(conversationParticipantsTable)
    .where(
      and(
        eq(conversationParticipantsTable.conversationId, conversationId),
        eq(conversationParticipantsTable.userId, userId),
      ),
    )
    .limit(1);
  return row.length > 0;
}

const ONLINE_MS = 5 * 60 * 1000;

function serializeUser(u: {
  id: number;
  firstName: string | null;
  lastName: string | null;
  email: string;
  profilePhotoUrl: string | null;
  role: string;
  lastSeenAt?: Date | null;
}) {
  const name = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email;
  const isOnline = u.lastSeenAt
    ? Date.now() - new Date(u.lastSeenAt).getTime() < ONLINE_MS
    : false;
  return {
    id: u.id,
    name,
    email: u.email,
    avatarUrl: u.profilePhotoUrl,
    isOnline,
    role:
      u.role === "seller"
        ? "Seller"
        : u.role === "admin"
          ? "Admin"
          : "Buyer",
  };
}

// ─── GET /messages ───────────────────────────────────────────────────────────
// List conversations for the current user with the other participant + last
// message + unread count.

router.get("/messages", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;

    // Conversations the user belongs to.
    const myParticipations = await db
      .select({
        conversationId: conversationParticipantsTable.conversationId,
        lastReadAt: conversationParticipantsTable.lastReadAt,
      })
      .from(conversationParticipantsTable)
      .where(eq(conversationParticipantsTable.userId, userId));

    if (myParticipations.length === 0) {
      res.json({ conversations: [] });
      return;
    }

    const convIds = myParticipations.map((p) => p.conversationId);
    const lastReadById = new Map(
      myParticipations.map((p) => [p.conversationId, p.lastReadAt]),
    );

    const convs = await db
      .select()
      .from(conversationsTable)
      .where(
        and(
          inArray(conversationsTable.id, convIds),
          eq(conversationsTable.type, "direct"),
        ),
      )
      .orderBy(desc(conversationsTable.updatedAt));

    if (convs.length === 0) {
      res.json({ conversations: [] });
      return;
    }

    const ids = convs.map((c) => c.id);

    // Other participants per conversation (one each — direct chats are 1:1).
    const otherRows = await db
      .select({
        conversationId: conversationParticipantsTable.conversationId,
        userId: usersTable.id,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        email: usersTable.email,
        profilePhotoUrl: usersTable.profilePhotoUrl,
        role: usersTable.role,
        lastSeenAt: usersTable.lastSeenAt,
      })
      .from(conversationParticipantsTable)
      .innerJoin(
        usersTable,
        eq(usersTable.id, conversationParticipantsTable.userId),
      )
      .where(
        and(
          inArray(conversationParticipantsTable.conversationId, ids),
          ne(conversationParticipantsTable.userId, userId),
        ),
      );

    const otherByConv = new Map<number, (typeof otherRows)[number]>();
    for (const row of otherRows) {
      if (!otherByConv.has(row.conversationId)) {
        otherByConv.set(row.conversationId, row);
      }
    }

    // Last message per conversation (small N, simple per-conv query).
    const lastByConv = new Map<
      number,
      { content: string; createdAt: Date; senderId: number }
    >();
    await Promise.all(
      ids.map(async (cid) => {
        const [m] = await db
          .select({
            content: messagesTable.content,
            createdAt: messagesTable.createdAt,
            senderId: messagesTable.senderId,
          })
          .from(messagesTable)
          .where(eq(messagesTable.conversationId, cid))
          .orderBy(desc(messagesTable.createdAt))
          .limit(1);
        if (m) lastByConv.set(cid, m);
      }),
    );

    // Unread count per conversation: messages from others after my lastReadAt.
    const unreadByConv = new Map<number, number>();
    await Promise.all(
      ids.map(async (cid) => {
        const lastRead = lastReadById.get(cid);
        const conditions = [
          eq(messagesTable.conversationId, cid),
          ne(messagesTable.senderId, userId),
        ];
        if (lastRead) conditions.push(sql`${messagesTable.createdAt} > ${lastRead}`);
        const [{ count }] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(messagesTable)
          .where(and(...conditions));
        unreadByConv.set(cid, Number(count ?? 0));
      }),
    );

    const payload = convs.map((c) => {
      const other = otherByConv.get(c.id);
      const last = lastByConv.get(c.id);
      return {
        id: c.id,
        listingId: c.listingId,
        subject: c.subject,
        updatedAt: c.updatedAt,
        other: other ? serializeUser({ ...other, id: other.userId }) : null,
        lastMessage: last
          ? {
              content: last.content,
              createdAt: last.createdAt,
              fromMe: last.senderId === userId,
            }
          : null,
        unread: unreadByConv.get(c.id) ?? 0,
      };
    });

    res.json({ conversations: payload });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to list conversations" });
  }
});

// ─── GET /messages/:id ───────────────────────────────────────────────────────
// Returns a single conversation (with other participant + listing) and all
// messages, then marks the conversation as read for the current user.

router.get("/messages/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid conversation id" });
      return;
    }

    if (!(await assertParticipant(id, userId))) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    const [conv] = await db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.id, id))
      .limit(1);
    if (!conv) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    const [otherRow] = await db
      .select({
        id: usersTable.id,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        email: usersTable.email,
        profilePhotoUrl: usersTable.profilePhotoUrl,
        role: usersTable.role,
        lastSeenAt: usersTable.lastSeenAt,
      })
      .from(conversationParticipantsTable)
      .innerJoin(
        usersTable,
        eq(usersTable.id, conversationParticipantsTable.userId),
      )
      .where(
        and(
          eq(conversationParticipantsTable.conversationId, id),
          ne(conversationParticipantsTable.userId, userId),
        ),
      )
      .limit(1);

    let listing: { id: number; title: string | null } | null = null;
    if (conv.listingId) {
      const [l] = await db
        .select({ id: listingsTable.id, title: listingsTable.title })
        .from(listingsTable)
        .where(eq(listingsTable.id, conv.listingId))
        .limit(1);
      if (l) listing = l;
    }

    const msgs = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, id))
      .orderBy(asc(messagesTable.createdAt));

    // Mark as read.
    await db
      .update(conversationParticipantsTable)
      .set({ lastReadAt: new Date() })
      .where(
        and(
          eq(conversationParticipantsTable.conversationId, id),
          eq(conversationParticipantsTable.userId, userId),
        ),
      );

    res.json({
      conversation: {
        id: conv.id,
        subject: conv.subject,
        listingId: conv.listingId,
        listing,
        other: otherRow ? serializeUser(otherRow) : null,
        updatedAt: conv.updatedAt,
      },
      messages: msgs.map((m) => ({
        id: m.id,
        senderId: m.senderId,
        content: m.content,
        isRead: m.isRead,
        createdAt: m.createdAt,
        fromMe: m.senderId === userId,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load conversation" });
  }
});

// ─── POST /messages ──────────────────────────────────────────────────────────
// Get-or-create a direct conversation with another user (typically the seller
// of a listing) and optionally seed the first message.

router.post("/messages", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const { recipientId, listingId, content, subject } = req.body ?? {};
    const otherId = Number(recipientId);
    const lid = listingId === undefined || listingId === null ? null : Number(listingId);
    const text = typeof content === "string" ? content.trim() : "";
    const normalizedSubject = typeof subject === "string" ? subject.trim() : "";

    if (!Number.isFinite(otherId) || otherId === userId) {
      res.status(400).json({ error: "Valid recipientId is required" });
      return;
    }
    if (lid !== null && !Number.isFinite(lid)) {
      res.status(400).json({ error: "Invalid listingId" });
      return;
    }

    const [recipient] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, otherId))
      .limit(1);
    if (!recipient) {
      res.status(404).json({ error: "Recipient not found" });
      return;
    }

    // Canonical pair-key for an advisory lock so that concurrent
    // start-chat requests for the same (userA, userB, listing) trio
    // serialize and never produce duplicate conversations.
    const lockA = Math.min(userId, otherId);
    const lockB = Math.max(userId, otherId) ^ ((lid ?? 0) << 1);

    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${lockA}, ${lockB})`);

      // Look up an existing direct conversation between the two users
      // (scoped to the same listing) inside the lock window.
      const myConvs = await tx
        .select({ conversationId: conversationParticipantsTable.conversationId })
        .from(conversationParticipantsTable)
        .where(eq(conversationParticipantsTable.userId, userId));
      const myConvIds = myConvs.map((r) => r.conversationId);

      let existingId: number | null = null;
      if (myConvIds.length > 0) {
        const shared = await tx
          .select({
            conversationId: conversationParticipantsTable.conversationId,
            listingId: conversationsTable.listingId,
          })
          .from(conversationParticipantsTable)
          .innerJoin(
            conversationsTable,
            eq(conversationsTable.id, conversationParticipantsTable.conversationId),
          )
          .where(
            and(
              inArray(conversationParticipantsTable.conversationId, myConvIds),
              eq(conversationParticipantsTable.userId, otherId),
              eq(conversationsTable.type, "direct"),
            ),
          );
        const match = shared.find((r) =>
          lid === null ? r.listingId === null : r.listingId === lid,
        );
        if (match) existingId = match.conversationId;
      }

      let convId = existingId;
      if (!convId) {
        const [created] = await tx
          .insert(conversationsTable)
          .values({
            type: "direct",
            listingId: lid,
            subject: normalizedSubject || null,
          })
          .returning();
        convId = created.id;
        await tx.insert(conversationParticipantsTable).values([
          { conversationId: convId, userId },
          { conversationId: convId, userId: otherId },
        ]);
      } else if (normalizedSubject) {
        // Backfill a missing subject on older conversations started before
        // listing-reference metadata was being persisted.
        await tx
          .update(conversationsTable)
          .set({ subject: normalizedSubject })
          .where(
            and(
              eq(conversationsTable.id, convId),
              sql`${conversationsTable.subject} is null`,
            ),
          );
      }

      let message = null as null | typeof messagesTable.$inferSelect;
      if (text) {
        const [m] = await tx
          .insert(messagesTable)
          .values({
            conversationId: convId,
            senderId: userId,
            content: text,
            isRead: false,
          })
          .returning();
        message = m;
        await tx
          .update(conversationsTable)
          .set({ updatedAt: new Date() })
          .where(eq(conversationsTable.id, convId));
      }

      return { conversationId: convId, message, created: existingId === null };
    });

    res.status(201).json({
      conversationId: result.conversationId,
      created: result.created,
      message: result.message
        ? {
            id: result.message.id,
            senderId: result.message.senderId,
            content: result.message.content,
            createdAt: result.message.createdAt,
            fromMe: true,
          }
        : null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to start conversation" });
  }
});

// ─── POST /messages/:id/messages ─────────────────────────────────────────────
// Send a message to an existing conversation.

router.post("/messages/:id/messages", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const id = Number(req.params.id);
    const text = typeof req.body?.content === "string" ? req.body.content.trim() : "";
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid conversation id" });
      return;
    }
    if (!text) {
      res.status(400).json({ error: "Message content is required" });
      return;
    }
    if (text.length > 4000) {
      res.status(400).json({ error: "Message is too long" });
      return;
    }
    if (!(await assertParticipant(id, userId))) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    const result = await db.transaction(async (tx) => {
      const [m] = await tx
        .insert(messagesTable)
        .values({
          conversationId: id,
          senderId: userId,
          content: text,
          isRead: false,
        })
        .returning();
      await tx
        .update(conversationsTable)
        .set({ updatedAt: new Date() })
        .where(eq(conversationsTable.id, id));
      await tx
        .update(conversationParticipantsTable)
        .set({ lastReadAt: new Date() })
        .where(
          and(
            eq(conversationParticipantsTable.conversationId, id),
            eq(conversationParticipantsTable.userId, userId),
          ),
        );
      return m;
    });

    const serialized = {
      id: result.id,
      senderId: result.senderId,
      content: result.content,
      createdAt: result.createdAt instanceof Date
        ? result.createdAt.toISOString()
        : result.createdAt,
    };

    // Push to any clients streaming this conversation (excludes sender).
    sseBroadcast(id, serialized);

    res.status(201).json({
      message: { ...serialized, fromMe: true },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to send message" });
  }
});

// ─── GET /messages/:id/stream ─────────────────────────────────────────────────
// Server-Sent Events endpoint. Clients open this once and receive new messages
// in real-time without polling.

router.get("/messages/:id/stream", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.user!.userId;
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).end();
    return;
  }
  if (!(await assertParticipant(id, userId))) {
    res.status(404).end();
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  sseSubscribe(id, res);

  // Heartbeat every 25 s — prevents idle connection timeouts.
  const hb = setInterval(() => {
    try { res.write(": heartbeat\n\n"); } catch { /* closed */ }
  }, 25_000);

  req.on("close", () => {
    clearInterval(hb);
    sseUnsubscribe(id, res);
  });
});

export default router;
