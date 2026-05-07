import { Router } from "express";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  supportTicketsTable,
  supportTicketMessagesTable,
  type SupportTicket,
} from "@workspace/db";
import { requireAuth, type AuthRequest } from "../lib/auth-middleware";

const router = Router();

const VALID_STATUSES = ["open", "in_progress", "resolved", "closed"] as const;
const VALID_PRIORITIES = ["low", "medium", "high", "urgent"] as const;

type StatusFilter = "all" | "open" | "closed";

function parseStatusFilter(raw: unknown): StatusFilter {
  if (raw === "open" || raw === "closed") return raw;
  return "all";
}

function serializeTicket(ticket: SupportTicket) {
  return {
    id: ticket.id,
    subject: ticket.subject,
    category: ticket.category,
    status: ticket.status,
    priority: ticket.priority,
    assignedTo: ticket.assignedTo,
    resolvedAt: ticket.resolvedAt,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
  };
}

// ─── GET /support/tickets ─────────────────────────────────────────────────────
// Lists the authenticated user's support tickets.

router.get("/support/tickets", requireAuth, async (req: AuthRequest, res) => {
  try {
    const filter = parseStatusFilter(req.query.status);
    const userId = req.user!.userId;

    const rows = await db
      .select()
      .from(supportTicketsTable)
      .where(eq(supportTicketsTable.userId, userId))
      .orderBy(desc(supportTicketsTable.updatedAt));

    const filtered = rows.filter((t) => {
      if (filter === "all") return true;
      if (filter === "closed") return t.status === "resolved" || t.status === "closed";
      return t.status !== "resolved" && t.status !== "closed";
    });

    res.json({
      tickets: filtered.map(serializeTicket),
      counts: {
        all: rows.length,
        open: rows.filter((t) => t.status !== "resolved" && t.status !== "closed").length,
        closed: rows.filter((t) => t.status === "resolved" || t.status === "closed").length,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to list tickets" });
  }
});

// ─── POST /support/tickets ────────────────────────────────────────────────────
// Creates a new ticket for the current user.

router.post("/support/tickets", requireAuth, async (req: AuthRequest, res) => {
  try {
    const {
      subject,
      category,
      priority,
      initialMessage,
    } = req.body as {
      subject?: string;
      category?: string;
      priority?: string;
      initialMessage?: string;
    };

    const resolvedSubject = subject?.trim() || "New Conversation";
    const resolvedPriority = (VALID_PRIORITIES as readonly string[]).includes(
      priority ?? "",
    )
      ? (priority as (typeof VALID_PRIORITIES)[number])
      : "medium";

    const [ticket] = await db
      .insert(supportTicketsTable)
      .values({
        userId: req.user!.userId,
        subject: resolvedSubject,
        category: category?.trim() || null,
        priority: resolvedPriority,
        status: "open",
      })
      .returning();

    let firstMessage = null;
    if (initialMessage && initialMessage.trim()) {
      const [msg] = await db
        .insert(supportTicketMessagesTable)
        .values({
          ticketId: ticket.id,
          senderId: req.user!.userId,
          content: initialMessage.trim(),
          isStaffReply: false,
        })
        .returning();
      firstMessage = msg;

      await db
        .update(supportTicketsTable)
        .set({ updatedAt: new Date() })
        .where(eq(supportTicketsTable.id, ticket.id));
    }

    res.status(201).json({
      ticket: serializeTicket(ticket),
      message: firstMessage,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create ticket" });
  }
});

// ─── GET /support/tickets/:id ─────────────────────────────────────────────────
// Returns a ticket with all its messages. Ownership enforced.

router.get("/support/tickets/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid ticket id" });
      return;
    }

    const ticket = await db
      .select()
      .from(supportTicketsTable)
      .where(
        and(
          eq(supportTicketsTable.id, id),
          eq(supportTicketsTable.userId, req.user!.userId),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);

    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    const messages = await db
      .select()
      .from(supportTicketMessagesTable)
      .where(eq(supportTicketMessagesTable.ticketId, id))
      .orderBy(asc(supportTicketMessagesTable.createdAt));

    res.json({
      ticket: serializeTicket(ticket),
      messages,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load ticket" });
  }
});

// ─── POST /support/tickets/:id/messages ───────────────────────────────────────
// Appends a message to a ticket the user owns.

router.post(
  "/support/tickets/:id/messages",
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        res.status(400).json({ error: "Invalid ticket id" });
        return;
      }

      const { content } = req.body as { content?: string };
      if (!content || !content.trim()) {
        res.status(400).json({ error: "Message content is required" });
        return;
      }

      // Ownership check
      const ticket = await db
        .select()
        .from(supportTicketsTable)
        .where(
          and(
            eq(supportTicketsTable.id, id),
            eq(supportTicketsTable.userId, req.user!.userId),
          ),
        )
        .limit(1)
        .then((rows) => rows[0]);

      if (!ticket) {
        res.status(404).json({ error: "Ticket not found" });
        return;
      }

      if (ticket.status === "closed") {
        res.status(400).json({ error: "This ticket is closed" });
        return;
      }

      const [message] = await db
        .insert(supportTicketMessagesTable)
        .values({
          ticketId: id,
          senderId: req.user!.userId,
          content: content.trim(),
          isStaffReply: false,
        })
        .returning();

      // Bump updatedAt and re-open if previously resolved
      await db
        .update(supportTicketsTable)
        .set({
          updatedAt: new Date(),
          status: ticket.status === "resolved" ? "open" : ticket.status,
        })
        .where(eq(supportTicketsTable.id, id));

      res.status(201).json({ message });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to send message" });
    }
  },
);

// ─── PATCH /support/tickets/:id ───────────────────────────────────────────────
// Allows the ticket owner to update status (e.g. mark resolved/closed).

router.patch("/support/tickets/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid ticket id" });
      return;
    }

    const { status } = req.body as { status?: string };
    if (!status || !(VALID_STATUSES as readonly string[]).includes(status)) {
      res.status(400).json({ error: "Invalid status" });
      return;
    }

    const typedStatus = status as (typeof VALID_STATUSES)[number];

    const [ticket] = await db
      .update(supportTicketsTable)
      .set({
        status: typedStatus,
        resolvedAt: typedStatus === "resolved" ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(supportTicketsTable.id, id),
          eq(supportTicketsTable.userId, req.user!.userId),
        ),
      )
      .returning();

    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    res.json({ ticket: serializeTicket(ticket) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update ticket" });
  }
});

export default router;
