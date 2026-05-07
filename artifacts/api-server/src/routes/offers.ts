import { Router } from "express";
import {
  db,
  offersTable,
  listingsTable,
  usersTable,
  sellerProfilesTable,
} from "@workspace/db";
import { and, eq, desc, inArray } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../lib/auth-middleware";
import { createNotification } from "../lib/notifications";

const router = Router();

// ─── GET /api/listings/:id/offers ───────────────────────────────────────────
// Seller-only: list all offers on a listing they own.
router.get(
  "/listings/:id/offers",
  requireAuth,
  async (req: AuthRequest, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [listing] = await db
      .select()
      .from(listingsTable)
      .where(eq(listingsTable.id, id))
      .limit(1);
    if (!listing) {
      res.status(404).json({ error: "Listing not found" });
      return;
    }
    if (listing.sellerId !== req.user!.userId) {
      res.status(403).json({ error: "Not your listing" });
      return;
    }
    const rows = await db
      .select({
        id: offersTable.id,
        listingId: offersTable.listingId,
        buyerId: offersTable.buyerId,
        sellerId: offersTable.sellerId,
        amount: offersTable.amount,
        counterAmount: offersTable.counterAmount,
        status: offersTable.status,
        buyerMessage: offersTable.buyerMessage,
        sellerMessage: offersTable.sellerMessage,
        createdAt: offersTable.createdAt,
        updatedAt: offersTable.updatedAt,
        buyerFirstName: usersTable.firstName,
        buyerLastName: usersTable.lastName,
        buyerEmail: usersTable.email,
      })
      .from(offersTable)
      .leftJoin(usersTable, eq(usersTable.id, offersTable.buyerId))
      .where(eq(offersTable.listingId, id))
      .orderBy(desc(offersTable.createdAt));
    res.json({ offers: rows });
  },
);

// ─── POST /api/offers ───────────────────────────────────────────────────────
// Buyer creates a new offer on a listing.
router.post("/offers", requireAuth, async (req: AuthRequest, res) => {
  const { listingId, amount, message } = (req.body ?? {}) as {
    listingId?: unknown;
    amount?: unknown;
    message?: unknown;
  };
  const lid = Number(listingId);
  const amt = Number(amount);
  if (!Number.isFinite(lid) || !Number.isFinite(amt) || amt <= 0) {
    res.status(400).json({ error: "Invalid listingId or amount" });
    return;
  }
  const [listing] = await db
    .select()
    .from(listingsTable)
    .where(eq(listingsTable.id, lid))
    .limit(1);
  if (!listing) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }
  if (listing.status !== "active") {
    res.status(400).json({ error: "Listing is not accepting offers" });
    return;
  }
  if (listing.sellerId === req.user!.userId) {
    res.status(400).json({ error: "You cannot make an offer on your own listing" });
    return;
  }
  const [created] = await db
    .insert(offersTable)
    .values({
      listingId: lid,
      buyerId: req.user!.userId,
      sellerId: listing.sellerId,
      amount: amt,
      buyerMessage: typeof message === "string" ? message : null,
    })
    .returning();
  void createNotification({
    userId: listing.sellerId,
    type: "offer_created",
    title: "New offer received",
    message: `A buyer placed an offer of ₦${Number(created.amount).toLocaleString()} on your listing.`,
    entityType: "offer",
    entityId: created.id,
    priority: "high",
  }).catch(() => {});
  res.status(201).json({ offer: created });
});

// ─── Helper: load offer + verify seller ownership ───────────────────────────
async function loadOfferAsSeller(
  offerId: number,
  sellerId: number,
): Promise<{ ok: true; offer: typeof offersTable.$inferSelect } | { ok: false; status: number; error: string }> {
  if (!Number.isFinite(offerId)) {
    return { ok: false, status: 400, error: "Invalid id" };
  }
  const [offer] = await db
    .select()
    .from(offersTable)
    .where(eq(offersTable.id, offerId))
    .limit(1);
  if (!offer) return { ok: false, status: 404, error: "Offer not found" };
  if (offer.sellerId !== sellerId) {
    return { ok: false, status: 403, error: "Not your offer" };
  }
  return { ok: true, offer };
}

// All transitions below use a single conditional UPDATE. The status whitelist
// is part of the WHERE clause so two concurrent actors (e.g. seller-accept +
// buyer-cancel) cannot both succeed — the second one finds 0 rows updated and
// returns 409 instead of silently overwriting the first.
const ACTIVE_STATUSES = ["pending", "countered"] as const;

// ─── PATCH /api/offers/:id/accept ───────────────────────────────────────────
router.patch(
  "/offers/:id/accept",
  requireAuth,
  async (req: AuthRequest, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const updated = await db
      .update(offersTable)
      .set({ status: "accepted", updatedAt: new Date() })
      .where(
        and(
          eq(offersTable.id, id),
          eq(offersTable.sellerId, req.user!.userId),
          inArray(offersTable.status, ACTIVE_STATUSES as unknown as ("pending" | "accepted" | "declined" | "countered" | "completed" | "expired" | "cancelled")[]),
        ),
      )
      .returning();
    if (updated.length === 0) {
      await respondConflictOrForbidden(id, req.user!.userId, "seller", res);
      return;
    }
    void createNotification({
      userId: updated[0].buyerId,
      type: "offer_accepted",
      title: "Offer accepted",
      message: "Your offer has been accepted. Proceed to payment to secure the car.",
      entityType: "offer",
      entityId: updated[0].id,
      priority: "critical",
    }).catch(() => {});
    res.json({ offer: updated[0] });
  },
);

// ─── PATCH /api/offers/:id/decline ──────────────────────────────────────────
router.patch(
  "/offers/:id/decline",
  requireAuth,
  async (req: AuthRequest, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const { message } = (req.body ?? {}) as { message?: unknown };
    const updated = await db
      .update(offersTable)
      .set({
        status: "declined",
        sellerMessage: typeof message === "string" ? message : null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(offersTable.id, id),
          eq(offersTable.sellerId, req.user!.userId),
          inArray(offersTable.status, ACTIVE_STATUSES as unknown as ("pending" | "accepted" | "declined" | "countered" | "completed" | "expired" | "cancelled")[]),
        ),
      )
      .returning();
    if (updated.length === 0) {
      await respondConflictOrForbidden(id, req.user!.userId, "seller", res);
      return;
    }
    void createNotification({
      userId: updated[0].buyerId,
      type: "offer_declined",
      title: "Offer declined",
      message: "Your offer was declined by the seller.",
      entityType: "offer",
      entityId: updated[0].id,
      priority: "normal",
    }).catch(() => {});
    res.json({ offer: updated[0] });
  },
);

// ─── PATCH /api/offers/:id/counter ──────────────────────────────────────────
router.patch(
  "/offers/:id/counter",
  requireAuth,
  async (req: AuthRequest, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const { amount, message } = (req.body ?? {}) as {
      amount?: unknown;
      message?: unknown;
    };
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      res.status(400).json({ error: "Invalid counter amount" });
      return;
    }
    const updated = await db
      .update(offersTable)
      .set({
        status: "countered",
        counterAmount: amt,
        sellerMessage: typeof message === "string" ? message : null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(offersTable.id, id),
          eq(offersTable.sellerId, req.user!.userId),
          inArray(offersTable.status, ACTIVE_STATUSES as unknown as ("pending" | "accepted" | "declined" | "countered" | "completed" | "expired" | "cancelled")[]),
        ),
      )
      .returning();
    if (updated.length === 0) {
      await respondConflictOrForbidden(id, req.user!.userId, "seller", res);
      return;
    }
    void createNotification({
      userId: updated[0].buyerId,
      type: "offer_countered",
      title: "Counter-offer received",
      message: `Seller countered with ₦${Number(updated[0].counterAmount ?? 0).toLocaleString()}.`,
      entityType: "offer",
      entityId: updated[0].id,
      priority: "high",
    }).catch(() => {});
    res.json({ offer: updated[0] });
  },
);

// ─── PATCH /api/offers/:id/buyer-accept ─────────────────────────────────────
// Buyer accepts the seller's counter-offer. The counter amount becomes the
// agreed price; we normalise it into `amount` and clear `counterAmount` so
// the rest of the purchase flow only needs to look at `amount`.
router.patch(
  "/offers/:id/buyer-accept",
  requireAuth,
  async (req: AuthRequest, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    // Load the row to read counterAmount before updating.
    const [offer] = await db
      .select()
      .from(offersTable)
      .where(eq(offersTable.id, id))
      .limit(1);
    if (!offer) {
      res.status(404).json({ error: "Offer not found" });
      return;
    }
    if (offer.buyerId !== req.user!.userId) {
      res.status(403).json({ error: "Not your offer" });
      return;
    }
    if (offer.status !== "countered" || offer.counterAmount == null) {
      res.status(409).json({ error: "No pending counter offer to accept" });
      return;
    }
    const [updated] = await db
      .update(offersTable)
      .set({
        status: "accepted",
        amount: offer.counterAmount,   // agreed price is the seller's counter
        counterAmount: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(offersTable.id, id),
          eq(offersTable.status, "countered"),
        ),
      )
      .returning();
    if (!updated) {
      res.status(409).json({ error: "Offer status changed concurrently" });
      return;
    }
    void createNotification({
      userId: updated.sellerId,
      type: "offer_accepted",
      title: "Counter-offer accepted",
      message: "Buyer accepted your counter-offer.",
      entityType: "offer",
      entityId: updated.id,
      priority: "high",
    }).catch(() => {});
    res.json({ offer: updated });
  },
);

// ─── PATCH /api/offers/:id/buyer-counter ────────────────────────────────────
// Buyer counters the seller's counter-offer. The offer ball goes back to the
// seller: status → pending, new buyer amount stored in `amount`,
// seller's counter cleared from `counterAmount`.
router.patch(
  "/offers/:id/buyer-counter",
  requireAuth,
  async (req: AuthRequest, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const { amount, message } = (req.body ?? {}) as {
      amount?: unknown;
      message?: unknown;
    };
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      res.status(400).json({ error: "Invalid counter amount" });
      return;
    }
    const updated = await db
      .update(offersTable)
      .set({
        status: "pending",
        amount: amt,
        counterAmount: null,
        buyerMessage: typeof message === "string" ? message : null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(offersTable.id, id),
          eq(offersTable.buyerId, req.user!.userId),
          eq(offersTable.status, "countered"),
        ),
      )
      .returning();
    if (updated.length === 0) {
      await respondConflictOrForbidden(id, req.user!.userId, "buyer", res);
      return;
    }
    void createNotification({
      userId: updated[0].sellerId,
      type: "offer_countered",
      title: "Buyer sent a counter-offer",
      message: `Buyer proposed a new amount of ₦${Number(updated[0].amount).toLocaleString()}.`,
      entityType: "offer",
      entityId: updated[0].id,
      priority: "high",
    }).catch(() => {});
    res.json({ offer: updated[0] });
  },
);

// ─── PATCH /api/offers/:id/cancel ───────────────────────────────────────────
// Buyer cancels their own offer.
router.patch(
  "/offers/:id/cancel",
  requireAuth,
  async (req: AuthRequest, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const updated = await db
      .update(offersTable)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(
        and(
          eq(offersTable.id, id),
          eq(offersTable.buyerId, req.user!.userId),
          inArray(offersTable.status, ACTIVE_STATUSES as unknown as ("pending" | "accepted" | "declined" | "countered" | "completed" | "expired" | "cancelled")[]),
        ),
      )
      .returning();
    if (updated.length === 0) {
      await respondConflictOrForbidden(id, req.user!.userId, "buyer", res);
      return;
    }
    void createNotification({
      userId: updated[0].sellerId,
      type: "offer_cancelled",
      title: "Offer cancelled by buyer",
      message: "A buyer cancelled their active offer.",
      entityType: "offer",
      entityId: updated[0].id,
      priority: "normal",
    }).catch(() => {});
    res.json({ offer: updated[0] });
  },
);

// Disambiguates a 0-rows-updated result into 404 / 403 / 409 by re-reading
// the row once. Done after the failed atomic update so the happy path stays
// a single round-trip.
async function respondConflictOrForbidden(
  id: number,
  userId: number,
  role: "seller" | "buyer",
  res: Parameters<typeof router.patch>[1] extends never ? never : import("express").Response,
) {
  const [row] = await db
    .select({ id: offersTable.id, status: offersTable.status, sellerId: offersTable.sellerId, buyerId: offersTable.buyerId })
    .from(offersTable)
    .where(eq(offersTable.id, id))
    .limit(1);
  if (!row) {
    res.status(404).json({ error: "Offer not found" });
    return;
  }
  const ownerId = role === "seller" ? row.sellerId : row.buyerId;
  if (ownerId !== userId) {
    res.status(403).json({ error: role === "seller" ? "Not your offer" : "Not your offer" });
    return;
  }
  res.status(409).json({ error: `Offer is already ${row.status}` });
}

// ─── GET /api/sellers/me/offers ─────────────────────────────────────────────
// Seller's combined Offers page: every offer across every listing they own.
// Supports `page`, `pageSize` (max 50), and a free-text `search` against the
// buyer's name and the listing's make/model/year.
router.get("/sellers/me/offers", requireAuth, async (req: AuthRequest, res) => {
  const sellerId = req.user!.userId;
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(
    50,
    Math.max(1, Number(req.query.pageSize) || 10),
  );
  const search =
    typeof req.query.search === "string" ? req.query.search.trim() : "";

  // We can't easily search against concatenated columns at the DB layer with
  // Drizzle's `sql` template across dialects, so we fetch a window large enough
  // for the current page after in-memory filtering. For typical sellers this
  // is fine; if a seller has thousands of offers we can swap to a SQL ILIKE.
  const all = await db
    .select({
      id: offersTable.id,
      listingId: offersTable.listingId,
      buyerId: offersTable.buyerId,
      amount: offersTable.amount,
      counterAmount: offersTable.counterAmount,
      status: offersTable.status,
      buyerMessage: offersTable.buyerMessage,
      sellerMessage: offersTable.sellerMessage,
      createdAt: offersTable.createdAt,
      updatedAt: offersTable.updatedAt,
      buyerFirstName: usersTable.firstName,
      buyerLastName: usersTable.lastName,
      buyerEmail: usersTable.email,
      listingMake: listingsTable.make,
      listingModel: listingsTable.model,
      listingYear: listingsTable.year,
    })
    .from(offersTable)
    .leftJoin(usersTable, eq(usersTable.id, offersTable.buyerId))
    .leftJoin(listingsTable, eq(listingsTable.id, offersTable.listingId))
    .where(eq(offersTable.sellerId, sellerId))
    .orderBy(desc(offersTable.createdAt));

  const filtered = search
    ? all.filter((o) => {
        const hay = [
          o.buyerFirstName,
          o.buyerLastName,
          o.buyerEmail,
          o.listingMake,
          o.listingModel,
          o.listingYear ? String(o.listingYear) : null,
          String(o.id),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(search.toLowerCase());
      })
    : all;

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;
  const offers = filtered.slice(start, start + pageSize);

  res.json({
    offers,
    pagination: { page, pageSize, total, totalPages },
  });
});

// ─── GET /api/offers/me ─────────────────────────────────────────────────────
// Buyer lists their own offers (used by buyer-activity page).
router.get("/offers/me", requireAuth, async (req: AuthRequest, res) => {
  const rows = await db
    .select({
      id: offersTable.id,
      listingId: offersTable.listingId,
      amount: offersTable.amount,
      counterAmount: offersTable.counterAmount,
      status: offersTable.status,
      buyerMessage: offersTable.buyerMessage,
      sellerMessage: offersTable.sellerMessage,
      createdAt: offersTable.createdAt,
      updatedAt: offersTable.updatedAt,
      listingMake: listingsTable.make,
      listingModel: listingsTable.model,
      listingYear: listingsTable.year,
      sellerFirstName: usersTable.firstName,
      sellerLastName: usersTable.lastName,
      sellerBusinessName: sellerProfilesTable.businessName,
    })
    .from(offersTable)
    .leftJoin(listingsTable, eq(listingsTable.id, offersTable.listingId))
    .leftJoin(usersTable, eq(usersTable.id, offersTable.sellerId))
    .leftJoin(
      sellerProfilesTable,
      eq(sellerProfilesTable.userId, offersTable.sellerId),
    )
    .where(eq(offersTable.buyerId, req.user!.userId))
    .orderBy(desc(offersTable.createdAt));
  res.json({ offers: rows });
});

// ─── GET /api/offers/:id ────────────────────────────────────────────────────
// Detail view: buyer or seller can read their own offer.
router.get("/offers/:id", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [row] = await db
    .select({
      id: offersTable.id,
      listingId: offersTable.listingId,
      buyerId: offersTable.buyerId,
      sellerId: offersTable.sellerId,
      amount: offersTable.amount,
      counterAmount: offersTable.counterAmount,
      status: offersTable.status,
      buyerMessage: offersTable.buyerMessage,
      sellerMessage: offersTable.sellerMessage,
      createdAt: offersTable.createdAt,
      updatedAt: offersTable.updatedAt,
      listingMake: listingsTable.make,
      listingModel: listingsTable.model,
      listingYear: listingsTable.year,
      listingPrice: listingsTable.price,
      sellerFirstName: usersTable.firstName,
      sellerLastName: usersTable.lastName,
      sellerBusinessName: sellerProfilesTable.businessName,
    })
    .from(offersTable)
    .leftJoin(listingsTable, eq(listingsTable.id, offersTable.listingId))
    .leftJoin(usersTable, eq(usersTable.id, offersTable.sellerId))
    .leftJoin(
      sellerProfilesTable,
      eq(sellerProfilesTable.userId, offersTable.sellerId),
    )
    .where(eq(offersTable.id, id))
    .limit(1);
  if (!row) {
    res.status(404).json({ error: "Offer not found" });
    return;
  }
  if (row.buyerId !== req.user!.userId && row.sellerId !== req.user!.userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  res.json({ offer: row });
});

export default router;
