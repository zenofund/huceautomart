import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { db } from "@workspace/db";
import {
  inspectionsTable,
  inspectionReportsTable,
  inspectionTypesTable,
  listingsTable,
  listingImagesTable,
  listingFeatureLinksTable,
  carFeaturesTable,
  usersTable,
  sellerProfilesTable,
  inspectorProfilesTable,
  offersTable,
  purchasesTable,
  reviewsTable,
  inspectorReviewsTable,
  walletAccountsTable,
  walletTransactionsTable,
  savedVehiclesTable,
  carViewHistoryTable,
} from "@workspace/db";
import {
  conversationParticipantsTable,
  conversationsTable,
  messagesTable,
} from "@workspace/db";
import { and, desc, eq, ilike, inArray, ne, or, sql, count, isNull } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../lib/auth-middleware";
import { createNotification, createRoleNotifications } from "../lib/notifications";
import { sendInspectionRequestedAdminEmail } from "../lib/email";

const router: IRouter = Router();

// Mirror of the rating → percent map used by the inspector dashboard so the
// buyer-side detail view returns the same numeric scores.
const RATING_PCT: Record<string, number> = {
  excellent: 100,
  good: 75,
  fair: 50,
  poor: 25,
};
const ratingPctOrNull = (r: string | null) =>
  r && r in RATING_PCT ? RATING_PCT[r] : null;

function computeOverallPercent(parts: Array<string | null>): number | null {
  const nums = parts
    .map((p) => (p && p in RATING_PCT ? RATING_PCT[p] : null))
    .filter((n): n is number => n !== null);
  if (!nums.length) return null;
  return Math.round(nums.reduce((s, n) => s + n, 0) / nums.length);
}

// Parse `?page=N&pageSize=M` with safe defaults. Cap pageSize so a malicious
// caller cannot ask for an unbounded set.
function parsePaging(req: AuthRequest) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 20));
  const search = String(req.query.search ?? "").trim();
  return { page, pageSize, search, offset: (page - 1) * pageSize };
}

async function getOrCreateWallet(userId: number, tx: any = db) {
  const [wallet] = await tx
    .insert(walletAccountsTable)
    .values({ userId, balance: 0, currency: "NGN" })
    .onConflictDoUpdate({
      target: walletAccountsTable.userId,
      set: { updatedAt: new Date() },
    })
    .returning();
  return wallet;
}

// ─── GET /api/buyer/inspections ──────────────────────────────────────────────
// Paginated list of the buyer's inspections, joined with car + inspector info
// so the activity table can render a row without a second round-trip.
router.get("/buyer/inspections", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const { page, pageSize, search, offset } = parsePaging(req);

    const inspectorAlias = sql<string>`(
      SELECT TRIM(CONCAT(u.first_name, ' ', u.last_name))
      FROM users u
      WHERE u.id = ${inspectionsTable.inspectorId}
    )`.as("inspector_name");

    const baseWhere = eq(inspectionsTable.buyerId, userId);
    const where = search
      ? and(
          baseWhere,
          or(
            ilike(listingsTable.make, `%${search}%`),
            ilike(listingsTable.model, `%${search}%`),
          )!,
        )
      : baseWhere;

    const [rows, totalRow] = await Promise.all([
      db
        .select({
          id: inspectionsTable.id,
          status: inspectionsTable.status,
          scheduledAt: inspectionsTable.scheduledAt,
          completedAt: inspectionsTable.completedAt,
          createdAt: inspectionsTable.createdAt,
          location: inspectionsTable.inspectionLocation,
          fee: inspectionsTable.fee,
          listingId: inspectionsTable.listingId,
          listingMake: listingsTable.make,
          listingModel: listingsTable.model,
          listingYear: listingsTable.year,
          typeName: inspectionTypesTable.name,
          inspectorName: inspectorAlias,
          // Report fields used to compute the overall result percent shown
          // in the activity table without a second query.
          overallCondition: inspectionReportsTable.overallCondition,
          bodyCondition: inspectionReportsTable.bodyCondition,
          engineCondition: inspectionReportsTable.engineCondition,
          interiorCondition: inspectionReportsTable.interiorCondition,
          electricalCondition: inspectionReportsTable.electricalCondition,
          suspensionCondition: inspectionReportsTable.suspensionCondition,
          tyreCondition: inspectionReportsTable.tyreCondition,
        })
        .from(inspectionsTable)
        .innerJoin(
          listingsTable,
          eq(listingsTable.id, inspectionsTable.listingId),
        )
        .innerJoin(
          inspectionTypesTable,
          eq(inspectionTypesTable.id, inspectionsTable.inspectionTypeId),
        )
        .leftJoin(
          inspectionReportsTable,
          eq(inspectionReportsTable.inspectionId, inspectionsTable.id),
        )
        .where(where)
        .orderBy(desc(inspectionsTable.createdAt))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ n: count() })
        .from(inspectionsTable)
        .innerJoin(
          listingsTable,
          eq(listingsTable.id, inspectionsTable.listingId),
        )
        .where(where),
    ]);

    res.json({
      page,
      pageSize,
      total: totalRow[0]?.n ?? 0,
      items: rows.map((r) => ({
        id: r.id,
        status: r.status,
        scheduledAt: r.scheduledAt,
        completedAt: r.completedAt,
        createdAt: r.createdAt,
        location: r.location,
        fee: Number(r.fee ?? 0),
        type: r.typeName,
        inspectorName: r.inspectorName ?? null,
        listingId: r.listingId,
        carDetails: `${r.listingMake} ${r.listingModel} ${r.listingYear}`,
        resultPercent: computeOverallPercent([
          r.overallCondition,
          r.bodyCondition,
          r.engineCondition,
          r.interiorCondition,
          r.electricalCondition,
          r.suspensionCondition,
          r.tyreCondition,
        ]),
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Error loading buyer inspections");
    res.status(500).json({ error: "Failed to load inspections" });
  }
});

// ─── GET /api/buyer/inspections/:id ──────────────────────────────────────────
// Single inspection plus its full report, restricted to the requesting
// buyer. The shape mirrors the inspector detail endpoint so the buyer page
// can reuse most of the same render logic.
router.get(
  "/buyer/inspections/:id",
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ error: "Invalid inspection id" });
        return;
      }

      const [row] = await db
        .select({
          id: inspectionsTable.id,
          status: inspectionsTable.status,
          paidAt: inspectionsTable.paidAt,
          scheduledAt: inspectionsTable.scheduledAt,
          completedAt: inspectionsTable.completedAt,
          location: inspectionsTable.inspectionLocation,
          fee: inspectionsTable.fee,
          notes: inspectionsTable.notes,
          buyerNotes: inspectionsTable.buyerNotes,
          createdAt: inspectionsTable.createdAt,
          inspectorId: inspectionsTable.inspectorId,
          listingId: inspectionsTable.listingId,
          listingMake: listingsTable.make,
          listingModel: listingsTable.model,
          listingYear: listingsTable.year,
          listingLocation: listingsTable.location,
          listingPrice: listingsTable.price,
          sellerId: listingsTable.sellerId,
          sellerBusinessName: sellerProfilesTable.businessName,
          typeName: inspectionTypesTable.name,
          // Report
          reportId: inspectionReportsTable.id,
          summary: inspectionReportsTable.summary,
          recommendedActions: inspectionReportsTable.recommendedActions,
          overallCondition: inspectionReportsTable.overallCondition,
          bodyCondition: inspectionReportsTable.bodyCondition,
          engineCondition: inspectionReportsTable.engineCondition,
          interiorCondition: inspectionReportsTable.interiorCondition,
          electricalCondition: inspectionReportsTable.electricalCondition,
          suspensionCondition: inspectionReportsTable.suspensionCondition,
          tyreCondition: inspectionReportsTable.tyreCondition,
          reportDetails: inspectionReportsTable.reportDetails,
          images: inspectionReportsTable.images,
        })
        .from(inspectionsTable)
        .innerJoin(
          listingsTable,
          eq(listingsTable.id, inspectionsTable.listingId),
        )
        .leftJoin(
          sellerProfilesTable,
          eq(sellerProfilesTable.userId, listingsTable.sellerId),
        )
        .innerJoin(
          inspectionTypesTable,
          eq(inspectionTypesTable.id, inspectionsTable.inspectionTypeId),
        )
        .leftJoin(
          inspectionReportsTable,
          eq(inspectionReportsTable.inspectionId, inspectionsTable.id),
        )
        .where(
          and(
            eq(inspectionsTable.id, id),
            eq(inspectionsTable.buyerId, userId),
          ),
        )
        .limit(1);

      if (!row) {
        res.status(404).json({ error: "Inspection not found" });
        return;
      }

      // Resolve the inspector name + seller name in two lightweight follow-up
      // queries so we keep the main join readable.
      let inspectorName: string | null = null;
      let inspectorRating: number | null = null;
      if (row.inspectorId) {
        const [iu] = await db
          .select({
            firstName: usersTable.firstName,
            lastName: usersTable.lastName,
          })
          .from(usersTable)
          .where(eq(usersTable.id, row.inspectorId))
          .limit(1);
        if (iu) inspectorName = `${iu.firstName} ${iu.lastName}`.trim();

        const [inspectorProfile] = await db
          .select({ rating: inspectorProfilesTable.rating })
          .from(inspectorProfilesTable)
          .where(eq(inspectorProfilesTable.userId, row.inspectorId))
          .limit(1);
        inspectorRating = inspectorProfile?.rating ?? null;
      }
      let sellerName = row.sellerBusinessName ?? null;
      if (!sellerName && row.sellerId) {
        const [su] = await db
          .select({
            firstName: usersTable.firstName,
            lastName: usersTable.lastName,
          })
          .from(usersTable)
          .where(eq(usersTable.id, row.sellerId))
          .limit(1);
        if (su) sellerName = `${su.firstName} ${su.lastName}`.trim();
      }

      const resultPercent = computeOverallPercent([
        row.overallCondition,
        row.bodyCondition,
        row.engineCondition,
        row.interiorCondition,
        row.electricalCondition,
        row.suspensionCondition,
        row.tyreCondition,
      ]);

      const [existingInspectorReview] = await db
        .select({
          rating: inspectorReviewsTable.rating,
          comment: inspectorReviewsTable.comment,
        })
        .from(inspectorReviewsTable)
        .where(
          and(
            eq(inspectorReviewsTable.inspectionId, row.id),
            eq(inspectorReviewsTable.buyerId, userId),
          ),
        )
        .limit(1);

      res.json({
        id: row.id,
        status: row.status,
        paidAt: row.paidAt,
        scheduledAt: row.scheduledAt,
        completedAt: row.completedAt,
        location: row.location ?? row.listingLocation ?? null,
        fee: Number(row.fee ?? 0),
        type: row.typeName,
        notes: row.notes,
        buyerNotes: row.buyerNotes,
        createdAt: row.createdAt,
        listingId: row.listingId,
        listingPrice: Number(row.listingPrice ?? 0),
        carDetails: `${row.listingMake} ${row.listingModel} ${row.listingYear}`,
        inspectorName,
        inspectorRating,
        inspectorReview: existingInspectorReview ?? null,
        sellerName: sellerName ?? "—",
        resultPercent,
        report: row.reportId
          ? {
              id: row.reportId,
              summary: row.summary,
              recommendedActions: row.recommendedActions,
              overallPercent: ratingPctOrNull(row.overallCondition),
              sections: {
                exterior: {
                  status: row.bodyCondition,
                  percent: ratingPctOrNull(row.bodyCondition),
                },
                interior: {
                  status: row.interiorCondition,
                  percent: ratingPctOrNull(row.interiorCondition),
                },
                engineTransmission: {
                  status: row.engineCondition,
                  percent: ratingPctOrNull(row.engineCondition),
                },
                suspensionBrakes: {
                  status: row.suspensionCondition,
                  percent: ratingPctOrNull(row.suspensionCondition),
                },
                tiresWheels: {
                  status: row.tyreCondition,
                  percent: ratingPctOrNull(row.tyreCondition),
                },
                lightsElectricals: {
                  status: row.electricalCondition,
                  percent: ratingPctOrNull(row.electricalCondition),
                },
              },
              images: row.images ?? [],
              details: row.reportDetails ?? null,
            }
          : null,
      });
    } catch (err) {
      req.log.error({ err }, "Error loading buyer inspection detail");
      res.status(500).json({ error: "Failed to load inspection" });
    }
  },
);

// ─── POST /api/buyer/inspections/:id/rate-inspector ─────────────────────────
// Buyer submits one rating per completed inspection report.
router.post(
  "/buyer/inspections/:id/rate-inspector",
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const id = Number(req.params.id);
      const body = req.body as { rating?: unknown; comment?: unknown };
      const rating = Number(body.rating);
      const comment =
        typeof body.comment === "string" ? body.comment.trim() : "";

      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ error: "Invalid inspection id" });
        return;
      }
      if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
        res.status(400).json({ error: "Rating must be between 1 and 5" });
        return;
      }

      const result = await db.transaction(async (tx) => {
        const [inspection] = await tx
          .select({
            id: inspectionsTable.id,
            buyerId: inspectionsTable.buyerId,
            inspectorId: inspectionsTable.inspectorId,
            status: inspectionsTable.status,
          })
          .from(inspectionsTable)
          .where(
            and(
              eq(inspectionsTable.id, id),
              eq(inspectionsTable.buyerId, userId),
            ),
          )
          .for("update")
          .limit(1);

        if (!inspection) {
          return { ok: false as const, status: 404, error: "Inspection not found" };
        }
        if (!inspection.inspectorId) {
          return {
            ok: false as const,
            status: 409,
            error: "Inspector is not assigned yet",
          };
        }
        const [report] = await tx
          .select({ id: inspectionReportsTable.id })
          .from(inspectionReportsTable)
          .where(eq(inspectionReportsTable.inspectionId, inspection.id))
          .limit(1);

        if (!report || inspection.status !== "completed") {
          return {
            ok: false as const,
            status: 409,
            error: "You can only rate after the inspection report is submitted",
          };
        }

        const [existing] = await tx
          .select({ id: inspectorReviewsTable.id })
          .from(inspectorReviewsTable)
          .where(eq(inspectorReviewsTable.inspectionId, inspection.id))
          .limit(1);
        if (existing) {
          return {
            ok: false as const,
            status: 409,
            error: "You have already rated this inspector for this inspection",
          };
        }

        const [review] = await tx
          .insert(inspectorReviewsTable)
          .values({
            inspectionId: inspection.id,
            buyerId: userId,
            inspectorId: inspection.inspectorId,
            rating,
            comment: comment || null,
          })
          .returning();

        const [agg] = await tx
          .select({
            avgRating:
              sql<number>`COALESCE(AVG(${inspectorReviewsTable.rating}), 0)::float`,
          })
          .from(inspectorReviewsTable)
          .where(eq(inspectorReviewsTable.inspectorId, inspection.inspectorId));

        await tx
          .update(inspectorProfilesTable)
          .set({
            rating: Number(agg?.avgRating ?? 0),
            updatedAt: new Date(),
          })
          .where(eq(inspectorProfilesTable.userId, inspection.inspectorId));

        return { ok: true as const, review };
      });

      if (!result.ok) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.status(201).json({ review: result.review });
    } catch (err) {
      req.log.error({ err }, "Error rating inspector");
      res.status(500).json({ error: "Failed to rate inspector" });
    }
  },
);

// ─── GET /api/buyer/purchases ────────────────────────────────────────────────
// Paginated list of completed purchases for the buyer with the seller's name
// and a single primary listing image so the activity table can render a
// thumbnail next to each row.
router.get("/buyer/purchases", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const { page, pageSize, search, offset } = parsePaging(req);

    const primaryImageAlias = sql<
      string | null
    >`(SELECT li.url FROM listing_images li
        WHERE li.listing_id = ${purchasesTable.listingId}
        ORDER BY li.is_primary DESC, li.display_order ASC
        LIMIT 1)`.as("primary_image");

    const baseWhere = eq(purchasesTable.buyerId, userId);
    const where = search
      ? and(
          baseWhere,
          or(
            ilike(listingsTable.make, `%${search}%`),
            ilike(listingsTable.model, `%${search}%`),
            ilike(purchasesTable.receiptNumber, `%${search}%`),
          )!,
        )
      : baseWhere;

    const [rows, totalRow] = await Promise.all([
      db
        .select({
          id: purchasesTable.id,
          offerId: purchasesTable.offerId,
          listingId: purchasesTable.listingId,
          amount: purchasesTable.amount,
          paymentMethod: purchasesTable.paymentMethod,
          paymentStatus: purchasesTable.paymentStatus,
          receiptNumber: purchasesTable.receiptNumber,
          createdAt: purchasesTable.createdAt,
          listingMake: listingsTable.make,
          listingModel: listingsTable.model,
          listingYear: listingsTable.year,
          sellerAccountType: usersTable.accountType,
          sellerFirstName: usersTable.firstName,
          sellerLastName: usersTable.lastName,
          sellerBusinessName: sellerProfilesTable.businessName,
          sellerLotName: sellerProfilesTable.lotName,
          primaryImage: primaryImageAlias,
          hasReview:
            sql<boolean>`EXISTS (SELECT 1 FROM ${reviewsTable} rv WHERE rv.purchase_id = ${purchasesTable.id})`.as(
              "has_review",
            ),
        })
        .from(purchasesTable)
        .innerJoin(
          listingsTable,
          eq(listingsTable.id, purchasesTable.listingId),
        )
        .leftJoin(usersTable, eq(usersTable.id, purchasesTable.sellerId))
        .leftJoin(sellerProfilesTable, eq(sellerProfilesTable.userId, purchasesTable.sellerId))
        .where(where)
        .orderBy(desc(purchasesTable.createdAt))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ n: count() })
        .from(purchasesTable)
        .innerJoin(
          listingsTable,
          eq(listingsTable.id, purchasesTable.listingId),
        )
        .where(where),
    ]);

    res.json({
      page,
      pageSize,
      total: totalRow[0]?.n ?? 0,
      items: rows.map((r) => ({
        id: r.id,
        offerId: r.offerId,
        listingId: r.listingId,
        amount: Number(r.amount ?? 0),
        paymentMethod: r.paymentMethod,
        paymentStatus: r.paymentStatus,
        receiptNumber: r.receiptNumber,
        createdAt: r.createdAt,
        carDetails: `${r.listingMake} ${r.listingModel} ${r.listingYear}`,
        sellerName:
          r.sellerAccountType === "company"
            ? [r.sellerBusinessName, r.sellerLotName].filter(Boolean).join(" / ") ||
              `${r.sellerFirstName ?? ""} ${r.sellerLastName ?? ""}`.trim() ||
              "—"
            : `${r.sellerFirstName ?? ""} ${r.sellerLastName ?? ""}`.trim() ||
              [r.sellerBusinessName, r.sellerLotName].filter(Boolean).join(" / ") ||
              "—",
        sellerAccountType: r.sellerAccountType ?? null,
        sellerBusinessName: r.sellerBusinessName ?? null,
        sellerLotName: r.sellerLotName ?? null,
        sellerFirstName: r.sellerFirstName ?? null,
        sellerLastName: r.sellerLastName ?? null,
        primaryImage: r.primaryImage ?? null,
        hasReview: Boolean(r.hasReview),
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Error loading buyer purchases");
    res.status(500).json({ error: "Failed to load purchases" });
  }
});

// ─── PATCH /api/buyer/purchases/:id/confirm ─────────────────────────────────
// Buyer confirms escrow release. This atomically:
// - marks purchase as completed
// - credits seller wallet
// - marks linked offer completed (if present)
router.patch(
  "/buyer/purchases/:id/confirm",
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ error: "Invalid purchase id" });
        return;
      }

      const result = await db.transaction(async (tx) => {
        const [purchase] = await tx
          .select()
          .from(purchasesTable)
          .where(and(eq(purchasesTable.id, id), eq(purchasesTable.buyerId, userId)))
          .for("update")
          .limit(1);
        if (!purchase) {
          return { ok: false as const, status: 404, error: "Purchase not found" };
        }
        if (purchase.paymentStatus === "completed") {
          return { ok: false as const, status: 409, error: "Purchase already confirmed" };
        }
        if (purchase.paymentStatus === "failed" || purchase.paymentStatus === "refunded") {
          return { ok: false as const, status: 409, error: "Purchase cannot be confirmed in current state" };
        }

        const [updatedPurchase] = await tx
          .update(purchasesTable)
          .set({ paymentStatus: "completed", updatedAt: new Date() })
          .where(
            and(
              eq(purchasesTable.id, id),
              inArray(purchasesTable.paymentStatus, ["pending", "in_escrow"]),
            ),
          )
          .returning();

        if (!updatedPurchase) {
          return { ok: false as const, status: 409, error: "Purchase status changed. Refresh and try again." };
        }

        const payout =
          (Number(updatedPurchase.sellerPayout) > 0
            ? Number(updatedPurchase.sellerPayout)
            : Number(updatedPurchase.amount) - Number(updatedPurchase.platformFee ?? 0)) || 0;

        if (payout > 0) {
          const sellerWallet = await getOrCreateWallet(updatedPurchase.sellerId, tx);

          const [credited] = await tx
            .update(walletAccountsTable)
            .set({
              balance: sql`${walletAccountsTable.balance} + ${payout}`,
              updatedAt: new Date(),
            })
            .where(eq(walletAccountsTable.id, sellerWallet.id))
            .returning();

          await tx.insert(walletTransactionsTable).values({
            walletId: sellerWallet.id,
            type: "receipt",
            amount: payout,
            status: "completed",
            reference: `SALE-REL-${updatedPurchase.id}-${randomUUID().slice(0, 8)}`,
            description: `Escrow release for purchase #${updatedPurchase.id}`,
            balanceBefore: Number(credited.balance) - payout,
            balanceAfter: Number(credited.balance),
            metadata: {
              purchaseId: updatedPurchase.id,
              listingId: updatedPurchase.listingId,
              buyerId: updatedPurchase.buyerId,
              paymentStatus: "completed",
            },
          });
        }

        if (updatedPurchase.offerId) {
          await tx
            .update(offersTable)
            .set({ status: "completed", updatedAt: new Date() })
            .where(eq(offersTable.id, updatedPurchase.offerId));
        }

        return { ok: true as const, purchase: updatedPurchase };
      });

      if (!result.ok) {
        res.status(result.status).json({ error: result.error });
        return;
      }

      const [existingReview] = await db
        .select({ id: reviewsTable.id })
        .from(reviewsTable)
        .where(eq(reviewsTable.purchaseId, result.purchase.id))
        .limit(1);

      res.json({
        purchase: result.purchase,
        reviewRequired: !existingReview,
      });
      void createNotification({
        userId: result.purchase.sellerId,
        type: "purchase_confirmed",
        title: "Escrow released",
        message: `Buyer confirmed purchase #${result.purchase.id}. Funds have been released to your wallet.`,
        entityType: "purchase",
        entityId: result.purchase.id,
        priority: "critical",
      }).catch(() => {});
    } catch (err) {
      req.log.error({ err }, "Error confirming buyer purchase");
      res.status(500).json({ error: "Failed to confirm purchase" });
    }
  },
);

// ─── POST /api/buyer/purchases/:id/review ────────────────────────────────────
// Buyer submits one review per completed purchase. The submitted rating updates
// the seller profile aggregate rating used across seller listings/profile pages.
router.post(
  "/buyer/purchases/:id/review",
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const id = Number(req.params.id);
      const body = req.body as { rating?: unknown; comment?: unknown };
      const rating = Number(body.rating);
      const comment =
        typeof body.comment === "string" ? body.comment.trim() : null;

      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ error: "Invalid purchase id" });
        return;
      }
      if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
        res.status(400).json({ error: "Rating must be between 1 and 5" });
        return;
      }

      const result = await db.transaction(async (tx) => {
        const [purchase] = await tx
          .select()
          .from(purchasesTable)
          .where(
            and(
              eq(purchasesTable.id, id),
              eq(purchasesTable.buyerId, userId),
            ),
          )
          .for("update")
          .limit(1);
        if (!purchase) {
          return { ok: false as const, status: 404, error: "Purchase not found" };
        }
        if (purchase.paymentStatus !== "completed") {
          return {
            ok: false as const,
            status: 409,
            error: "You can only review completed purchases",
          };
        }

        const [existing] = await tx
          .select({ id: reviewsTable.id })
          .from(reviewsTable)
          .where(eq(reviewsTable.purchaseId, purchase.id))
          .limit(1);
        if (existing) {
          return {
            ok: false as const,
            status: 409,
            error: "You have already reviewed this purchase",
          };
        }

        const [review] = await tx
          .insert(reviewsTable)
          .values({
            listingId: purchase.listingId,
            purchaseId: purchase.id,
            buyerId: purchase.buyerId,
            sellerId: purchase.sellerId,
            rating,
            comment,
          })
          .returning();

        const [agg] = await tx
          .select({
            avgRating:
              sql<number>`COALESCE(AVG(${reviewsTable.rating}), 0)::float`,
          })
          .from(reviewsTable)
          .where(eq(reviewsTable.sellerId, purchase.sellerId));

        await tx
          .update(sellerProfilesTable)
          .set({
            rating: Number(agg?.avgRating ?? 0),
            updatedAt: new Date(),
          })
          .where(eq(sellerProfilesTable.userId, purchase.sellerId));

        return { ok: true as const, review };
      });

      if (!result.ok) {
        res.status(result.status).json({ error: result.error });
        return;
      }

      res.status(201).json({ review: result.review });
    } catch (err) {
      req.log.error({ err }, "Error creating buyer review");
      res.status(500).json({ error: "Failed to submit review" });
    }
  },
);

// ─── PATCH /api/buyer/purchases/:id/cancel ──────────────────────────────────
// Buyer cancels purchase while still in escrow.
router.patch(
  "/buyer/purchases/:id/cancel",
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ error: "Invalid purchase id" });
        return;
      }

      const result = await db.transaction(async (tx) => {
        const [purchase] = await tx
          .select()
          .from(purchasesTable)
          .where(and(eq(purchasesTable.id, id), eq(purchasesTable.buyerId, userId)))
          .for("update")
          .limit(1);
        if (!purchase) {
          return { ok: false as const, status: 404, error: "Purchase not found" };
        }
        if (purchase.paymentStatus === "completed") {
          return { ok: false as const, status: 409, error: "Completed purchases cannot be cancelled" };
        }
        if (purchase.paymentStatus === "failed" || purchase.paymentStatus === "refunded") {
          return { ok: false as const, status: 409, error: "Purchase is already closed" };
        }

        const [updatedPurchase] = await tx
          .update(purchasesTable)
          .set({ paymentStatus: "refunded", updatedAt: new Date() })
          .where(
            and(
              eq(purchasesTable.id, id),
              inArray(purchasesTable.paymentStatus, ["pending", "in_escrow"]),
            ),
          )
          .returning();
        if (!updatedPurchase) {
          return { ok: false as const, status: 409, error: "Purchase status changed. Refresh and try again." };
        }

        // Return listing to market if it was reserved by escrow purchase.
        await tx
          .update(listingsTable)
          .set({ status: "active", updatedAt: new Date() })
          .where(and(eq(listingsTable.id, updatedPurchase.listingId), eq(listingsTable.status, "sold")));

        if (updatedPurchase.offerId) {
          await tx
            .update(offersTable)
            .set({ status: "accepted", updatedAt: new Date() })
            .where(eq(offersTable.id, updatedPurchase.offerId));
        }

        return { ok: true as const, purchase: updatedPurchase };
      });

      if (!result.ok) {
        res.status(result.status).json({ error: result.error });
        return;
      }

      res.json({ purchase: result.purchase });
      void createNotification({
        userId: result.purchase.sellerId,
        type: "purchase_cancelled",
        title: "Purchase cancelled",
        message: `Buyer cancelled purchase #${result.purchase.id}.`,
        entityType: "purchase",
        entityId: result.purchase.id,
        priority: "high",
      }).catch(() => {});
    } catch (err) {
      req.log.error({ err }, "Error cancelling buyer purchase");
      res.status(500).json({ error: "Failed to cancel purchase" });
    }
  },
);

// ─── PATCH /api/buyer/purchases/:id/dispute ─────────────────────────────────
// Buyer raises dispute while funds remain in escrow.
router.patch(
  "/buyer/purchases/:id/dispute",
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const id = Number(req.params.id);
      const reason =
        typeof (req.body as { reason?: unknown })?.reason === "string"
          ? (req.body as { reason?: string }).reason!.trim()
          : "";

      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ error: "Invalid purchase id" });
        return;
      }

      const [purchase] = await db
        .select()
        .from(purchasesTable)
        .where(and(eq(purchasesTable.id, id), eq(purchasesTable.buyerId, userId)))
        .limit(1);
      if (!purchase) {
        res.status(404).json({ error: "Purchase not found" });
        return;
      }
      if (purchase.paymentStatus === "completed") {
        res.status(409).json({ error: "Completed purchases cannot be disputed here" });
        return;
      }
      if (purchase.paymentStatus === "failed" || purchase.paymentStatus === "refunded") {
        res.status(409).json({ error: "Purchase is already closed" });
        return;
      }

      const note = reason
        ? `DISPUTE (${new Date().toISOString()}): ${reason}`
        : `DISPUTE (${new Date().toISOString()}): Buyer raised a dispute.`;
      const mergedNotes = purchase.notes ? `${purchase.notes}\n${note}` : note;

      const [updated] = await db
        .update(purchasesTable)
        .set({
          // Keep as pending under dispute while funds remain held.
          paymentStatus: "pending",
          notes: mergedNotes,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(purchasesTable.id, id),
            inArray(purchasesTable.paymentStatus, ["pending", "in_escrow"]),
          ),
        )
        .returning();

      if (!updated) {
        res.status(409).json({ error: "Purchase status changed. Refresh and try again." });
        return;
      }

      res.json({ purchase: updated });
      void createNotification({
        userId: updated.sellerId,
        type: "purchase_disputed",
        title: "Purchase disputed",
        message: `Buyer raised a dispute for purchase #${updated.id}.`,
        entityType: "purchase",
        entityId: updated.id,
        priority: "critical",
      }).catch(() => {});
      void createRoleNotifications("admin", {
        type: "purchase_disputed",
        title: "Dispute alert",
        message: `Purchase #${updated.id} has been marked as disputed.`,
        entityType: "purchase",
        entityId: updated.id,
        priority: "critical",
      }).catch(() => {});
    } catch (err) {
      req.log.error({ err }, "Error disputing buyer purchase");
      res.status(500).json({ error: "Failed to raise dispute" });
    }
  },
);

// ─── GET /api/buyer/listings/:id ─────────────────────────────────────────────
// Buyer-readable listing detail used by the offer-detail page. Unlike the
// seller's /listings/:id this returns any non-deleted listing for any
// authenticated user along with its images, feature flags and seller name.
router.get(
  "/buyer/listings/:id",
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ error: "Invalid listing id" });
        return;
      }

      const userId = req.user!.userId;

      const [listing] = await db
        .select()
        .from(listingsTable)
        .where(eq(listingsTable.id, id))
        .limit(1);
      if (!listing || listing.status === "deleted") {
        res.status(404).json({ error: "Listing not found" });
        return;
      }

      // The buyer flow exposes only listings the user has a relationship
      // with (a placed offer, requested inspection, or completed purchase).
      // For unrelated listings the public /api/cars endpoint should be used
      // instead, which returns the marketplace-safe projection.
      const [hasOffer, hasInspection, hasPurchase] = await Promise.all([
        db
          .select({ id: offersTable.id })
          .from(offersTable)
          .where(
            and(
              eq(offersTable.listingId, id),
              eq(offersTable.buyerId, userId),
            ),
          )
          .limit(1),
        db
          .select({ id: inspectionsTable.id })
          .from(inspectionsTable)
          .where(
            and(
              eq(inspectionsTable.listingId, id),
              eq(inspectionsTable.buyerId, userId),
            ),
          )
          .limit(1),
        db
          .select({ id: purchasesTable.id })
          .from(purchasesTable)
          .where(
            and(
              eq(purchasesTable.listingId, id),
              eq(purchasesTable.buyerId, userId),
            ),
          )
          .limit(1),
      ]);
      if (!hasOffer.length && !hasInspection.length && !hasPurchase.length) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      const [images, features, seller] = await Promise.all([
        db
          .select()
          .from(listingImagesTable)
          .where(eq(listingImagesTable.listingId, id))
          .orderBy(listingImagesTable.displayOrder),
        db
          .select({
            id: carFeaturesTable.id,
            name: carFeaturesTable.name,
            featureGroup: carFeaturesTable.featureGroup,
          })
          .from(listingFeatureLinksTable)
          .innerJoin(
            carFeaturesTable,
            eq(carFeaturesTable.id, listingFeatureLinksTable.featureId),
          )
          .where(eq(listingFeatureLinksTable.listingId, id)),
        db
          .select({
            id: usersTable.id,
            firstName: usersTable.firstName,
            lastName: usersTable.lastName,
            businessName: sellerProfilesTable.businessName,
          })
          .from(usersTable)
          .leftJoin(
            sellerProfilesTable,
            eq(sellerProfilesTable.userId, usersTable.id),
          )
          .where(eq(usersTable.id, listing.sellerId))
          .limit(1),
      ]);

      const sellerRow = seller[0];
      const sellerName = sellerRow
        ? sellerRow.businessName ??
          `${sellerRow.firstName} ${sellerRow.lastName}`.trim()
        : "—";

      res.json({
        listing,
        images,
        features,
        sellerName,
      });
    } catch (err) {
      req.log.error({ err }, "Error loading buyer listing");
      res.status(500).json({ error: "Failed to load listing" });
    }
  },
);

void offersTable;

// ─── Helpers ────────────────────────────────────────────────────────────────
// Convert a row from listingsTable + sellerName into the `Car` shape used by
// the marketplace UI components (matches lib/api-client-react `Car`). Images
// are passed in separately because they're fetched as a batch.
function toCarPayload(
  l: typeof listingsTable.$inferSelect,
  images: string[],
  sellerName: string,
) {
  return {
    id: l.id,
    make: l.make,
    model: l.model,
    year: l.year,
    price: Number(l.price),
    condition: l.condition,
    location: l.location,
    mileage: l.mileage ?? undefined,
    color: l.color ?? undefined,
    carType: l.carType ?? undefined,
    transmission: l.transmission ?? undefined,
    fuelType: l.fuelType ?? undefined,
    driveType: l.driveType ?? undefined,
    doors: l.doors ?? undefined,
    vin: l.vin ?? undefined,
    description: l.description ?? undefined,
    images,
    sellerId: l.sellerId,
    sellerName,
    featured: l.isFeatured ?? false,
    createdAt:
      l.createdAt instanceof Date ? l.createdAt.toISOString() : l.createdAt,
  };
}

// Hydrate a list of listing IDs into Car payloads. Returns one entry per id
// in the same order as `ids`. Listings that have been removed/deleted are
// dropped silently — the caller's pruning behaviour is intentional so stale
// saved/history rows don't surface broken cards in the UI.
async function hydrateCars(ids: number[]) {
  if (ids.length === 0) return [] as ReturnType<typeof toCarPayload>[];

  const [listings, images] = await Promise.all([
    db
      .select()
      .from(listingsTable)
      .where(
        and(
          inArray(listingsTable.id, ids),
          // Exclude soft-deleted; everything else (active/sold/pending) is fine
          // to surface in the buyer's own saved/history lists.
          sql`${listingsTable.status} != 'deleted'`,
        ),
      ),
    db
      .select({
        listingId: listingImagesTable.listingId,
        url: listingImagesTable.url,
        isPrimary: listingImagesTable.isPrimary,
        displayOrder: listingImagesTable.displayOrder,
      })
      .from(listingImagesTable)
      .where(inArray(listingImagesTable.listingId, ids))
      .orderBy(
        desc(listingImagesTable.isPrimary),
        listingImagesTable.displayOrder,
      ),
  ]);

  // Hydrate sellers only for the listings we actually returned. Querying
  // every seller in the system would scale poorly.
  const sellerIds = Array.from(new Set(listings.map((l) => l.sellerId)));
  const sellerRows = sellerIds.length
    ? await db
        .select({
          sellerId: sellerProfilesTable.userId,
          businessName: sellerProfilesTable.businessName,
          firstName: usersTable.firstName,
          lastName: usersTable.lastName,
        })
        .from(sellerProfilesTable)
        .innerJoin(usersTable, eq(usersTable.id, sellerProfilesTable.userId))
        .where(inArray(sellerProfilesTable.userId, sellerIds))
    : [];

  const imagesByListing = new Map<number, string[]>();
  for (const img of images) {
    const arr = imagesByListing.get(img.listingId) ?? [];
    arr.push(img.url);
    imagesByListing.set(img.listingId, arr);
  }

  const sellerNameById = new Map<number, string>();
  for (const s of sellerRows) {
    sellerNameById.set(
      s.sellerId,
      s.businessName ?? `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim(),
    );
  }

  const listingById = new Map<number, typeof listingsTable.$inferSelect>();
  for (const l of listings) listingById.set(l.id, l);

  // Preserve caller's id order so "most recent first" sorting from the
  // saved/history queries is respected on the response.
  const out: ReturnType<typeof toCarPayload>[] = [];
  for (const id of ids) {
    const l = listingById.get(id);
    if (!l) continue;
    out.push(
      toCarPayload(
        l,
        imagesByListing.get(l.id) ?? [],
        sellerNameById.get(l.sellerId) ?? "—",
      ),
    );
  }
  return out;
}

// ─── Saved vehicles ─────────────────────────────────────────────────────────

// Check whether a single listing is saved by the authenticated buyer.
// Must be registered before the DELETE /buyer/saved/:listingId route so
// the literal path segment "check" is matched before the wildcard param.
router.get(
  "/buyer/saved/check/:listingId",
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const listingId = Number(req.params.listingId);
      if (!Number.isInteger(listingId) || listingId <= 0) {
        res.status(400).json({ error: "Invalid listingId" });
        return;
      }
      const [row] = await db
        .select({ id: savedVehiclesTable.id })
        .from(savedVehiclesTable)
        .where(
          and(
            eq(savedVehiclesTable.buyerId, userId),
            eq(savedVehiclesTable.listingId, listingId),
          ),
        )
        .limit(1);
      res.json({ saved: !!row });
    } catch (err) {
      req.log.error({ err }, "Error checking saved vehicle");
      res.status(500).json({ error: "Failed to check saved status" });
    }
  },
);

router.get("/buyer/saved", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const rows = await db
      .select({ listingId: savedVehiclesTable.listingId })
      .from(savedVehiclesTable)
      .where(eq(savedVehiclesTable.buyerId, userId))
      .orderBy(desc(savedVehiclesTable.createdAt));
    const cars = await hydrateCars(rows.map((r) => r.listingId));
    res.json({ data: cars });
  } catch (err) {
    req.log.error({ err }, "Error loading saved vehicles");
    res.status(500).json({ error: "Failed to load saved vehicles" });
  }
});

router.post("/buyer/saved", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const listingId = Number((req.body as { listingId?: unknown }).listingId);
    if (!Number.isInteger(listingId) || listingId <= 0) {
      res.status(400).json({ error: "Invalid listingId" });
      return;
    }
    const [listing] = await db
      .select({ id: listingsTable.id, status: listingsTable.status })
      .from(listingsTable)
      .where(eq(listingsTable.id, listingId))
      .limit(1);
    if (!listing || listing.status === "deleted") {
      res.status(404).json({ error: "Listing not found" });
      return;
    }
    // Idempotent insert: the (buyer_id, listing_id) unique index enforces
    // one row per buyer/listing pair, so duplicate POSTs are no-ops.
    await db
      .insert(savedVehiclesTable)
      .values({ buyerId: userId, listingId })
      .onConflictDoNothing({
        target: [savedVehiclesTable.buyerId, savedVehiclesTable.listingId],
      });
    res.status(201).json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Error saving vehicle");
    res.status(500).json({ error: "Failed to save vehicle" });
  }
});

router.delete(
  "/buyer/saved/:listingId",
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const listingId = Number(req.params.listingId);
      if (!Number.isInteger(listingId) || listingId <= 0) {
        res.status(400).json({ error: "Invalid listingId" });
        return;
      }
      await db
        .delete(savedVehiclesTable)
        .where(
          and(
            eq(savedVehiclesTable.buyerId, userId),
            eq(savedVehiclesTable.listingId, listingId),
          ),
        );
      res.json({ ok: true });
    } catch (err) {
      req.log.error({ err }, "Error removing saved vehicle");
      res.status(500).json({ error: "Failed to remove saved vehicle" });
    }
  },
);

// ─── Car view history ───────────────────────────────────────────────────────
// History is intentionally collapsed to one row per listing (latest viewedAt)
// so the UI shows distinct cars even when the buyer revisits the same page.
// Per-view rows are still inserted for analytics fidelity.

router.get("/buyer/history", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const rows = await db
      .select({
        listingId: carViewHistoryTable.listingId,
        latest: sql<string>`max(${carViewHistoryTable.viewedAt})`.as("latest"),
      })
      .from(carViewHistoryTable)
      .where(eq(carViewHistoryTable.viewerId, userId))
      .groupBy(carViewHistoryTable.listingId)
      .orderBy(sql`max(${carViewHistoryTable.viewedAt}) desc`);
    const cars = await hydrateCars(rows.map((r) => r.listingId));
    res.json({ data: cars });
  } catch (err) {
    req.log.error({ err }, "Error loading view history");
    res.status(500).json({ error: "Failed to load view history" });
  }
});

router.post("/buyer/history", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const listingId = Number((req.body as { listingId?: unknown }).listingId);
    if (!Number.isInteger(listingId) || listingId <= 0) {
      res.status(400).json({ error: "Invalid listingId" });
      return;
    }
    const [listing] = await db
      .select({ id: listingsTable.id, status: listingsTable.status })
      .from(listingsTable)
      .where(eq(listingsTable.id, listingId))
      .limit(1);
    if (!listing || listing.status === "deleted") {
      res.status(404).json({ error: "Listing not found" });
      return;
    }
    await db
      .insert(carViewHistoryTable)
      .values({ viewerId: userId, listingId });
    res.status(201).json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Error recording view");
    res.status(500).json({ error: "Failed to record view" });
  }
});

router.delete("/buyer/history", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    await db
      .delete(carViewHistoryTable)
      .where(eq(carViewHistoryTable.viewerId, userId));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Error clearing view history");
    res.status(500).json({ error: "Failed to clear view history" });
  }
});

// ─── Inspection types (admin-configured pricing) ────────────────────────────
// Public to authenticated users. Admins manage rows in `inspection_types`;
// the buyer-side dialog reads them here so prices stay in sync without code
// changes.
router.get(
  "/inspection-types",
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      const rows = await db
        .select({
          id: inspectionTypesTable.id,
          name: inspectionTypesTable.name,
          description: inspectionTypesTable.description,
          price: inspectionTypesTable.price,
          durationHours: inspectionTypesTable.durationHours,
        })
        .from(inspectionTypesTable)
        .where(eq(inspectionTypesTable.isActive, true))
        .orderBy(inspectionTypesTable.price);
      res.json({ data: rows });
    } catch (err) {
      req.log.error({ err }, "Error loading inspection types");
      res.status(500).json({ error: "Failed to load inspection types" });
    }
  },
);

// ─── Book an inspection ─────────────────────────────────────────────────────
// Buyer creates an inspection request for a listing. Fee is read from the
// inspection_types row (server-trusted) — never from the client — so users
// can't downgrade the price by tampering with the request body.
router.post(
  "/buyer/inspections",
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const body = req.body as {
        listingId?: unknown;
        inspectionTypeId?: unknown;
        scheduledAt?: unknown;
        timeWindow?: unknown;
        location?: unknown;
      };

      const listingId = Number(body.listingId);
      const inspectionTypeId = Number(body.inspectionTypeId);
      const scheduledAtRaw =
        typeof body.scheduledAt === "string" ? body.scheduledAt : null;
      const scheduledAt = scheduledAtRaw ? new Date(scheduledAtRaw) : null;
      const timeWindow =
        typeof body.timeWindow === "string" ? body.timeWindow.trim() : "";
      const location =
        typeof body.location === "string" ? body.location.trim() : null;

      if (!Number.isInteger(listingId) || listingId <= 0) {
        res.status(400).json({ error: "Invalid listingId" });
        return;
      }
      if (!Number.isInteger(inspectionTypeId) || inspectionTypeId <= 0) {
        res.status(400).json({ error: "Invalid inspectionTypeId" });
        return;
      }
      if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) {
        res.status(400).json({ error: "Invalid scheduledAt" });
        return;
      }

      const [[listing], [inspectionType]] = await Promise.all([
        db
          .select({
            id: listingsTable.id,
            sellerId: listingsTable.sellerId,
            status: listingsTable.status,
            make: listingsTable.make,
            model: listingsTable.model,
            year: listingsTable.year,
          })
          .from(listingsTable)
          .where(eq(listingsTable.id, listingId))
          .limit(1),
        db
          .select()
          .from(inspectionTypesTable)
          .where(
            and(
              eq(inspectionTypesTable.id, inspectionTypeId),
              eq(inspectionTypesTable.isActive, true),
            ),
          )
          .limit(1),
      ]);

      if (!listing || listing.status === "deleted") {
        res.status(404).json({ error: "Listing not found" });
        return;
      }
      if (listing.sellerId === userId) {
        res
          .status(400)
          .json({ error: "You cannot inspect your own listing" });
        return;
      }
      if (!inspectionType) {
        res.status(404).json({ error: "Inspection type not available" });
        return;
      }

      const fee = Number(inspectionType.price);
      const notes = timeWindow ? `Time window: ${timeWindow}` : null;

      const [created] = await db
        .insert(inspectionsTable)
        .values({
          listingId,
          buyerId: userId,
          inspectionTypeId,
          status: "pending",
          scheduledAt,
          inspectionLocation: location,
          buyerNotes: notes,
          fee,
          // inspectorEarnings + platformFee are split when an inspector is
          // assigned and the job completes; left at 0 on creation.
        })
        .returning({ id: inspectionsTable.id });

      void createRoleNotifications("admin", {
        type: "system",
        title: "New inspection request",
        message: `Buyer requested inspection #${created.id} for ${listing.make} ${listing.model} ${listing.year}.`,
        entityType: "inspection",
        entityId: created.id,
        priority: "high",
        data: {
          inspectionId: created.id,
          listingId,
          buyerId: userId,
        },
      }).catch(() => {});

      const admins = await db
        .select({
          email: usersTable.email,
          firstName: usersTable.firstName,
        })
        .from(usersTable)
        .where(
          and(
            eq(usersTable.role, "admin"),
            or(
              isNull(usersTable.suspendedUntil),
              sql`${usersTable.suspendedUntil} < now()`,
            )!,
          ),
        );

      const buyer = await db
        .select({
          firstName: usersTable.firstName,
          lastName: usersTable.lastName,
        })
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1)
        .then((rows) => rows[0]);
      const buyerName = buyer
        ? `${buyer.firstName} ${buyer.lastName}`.trim()
        : "Buyer";
      const carName = `${listing.make} ${listing.model} ${listing.year}`;

      void Promise.all(
        admins.map((admin) =>
          sendInspectionRequestedAdminEmail({
            email: admin.email,
            firstName: admin.firstName || "Admin",
            inspectionId: created.id,
            buyerName,
            carName,
            scheduledAt,
            location,
          }),
        ),
      ).catch(() => {});

      res.status(201).json({ inspection: { id: created.id, fee } });
    } catch (err) {
      req.log.error({ err }, "Error creating inspection");
      res.status(500).json({ error: "Failed to create inspection" });
    }
  },
);

// ─── GET /api/buyer/stats ─────────────────────────────────────────────────────
// Summary counts for the buyer dashboard home page.
router.get("/buyer/stats", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;

    const [
      purchaseRow,
      offersTotalRow,
      offersAcceptedRow,
      offersRejectedRow,
      savedRow,
      inspectionRow,
      conversationRow,
      unreadRow,
    ] = await Promise.all([
      db.select({ n: count() }).from(purchasesTable).where(eq(purchasesTable.buyerId, userId)),
      db.select({ n: count() }).from(offersTable).where(eq(offersTable.buyerId, userId)),
      db.select({ n: count() }).from(offersTable).where(and(eq(offersTable.buyerId, userId), eq(offersTable.status, "accepted"))),
      db.select({ n: count() }).from(offersTable).where(and(eq(offersTable.buyerId, userId), eq(offersTable.status, "declined"))),
      db.select({ n: count() }).from(savedVehiclesTable).where(eq(savedVehiclesTable.buyerId, userId)),
      db.select({ n: count() }).from(inspectionsTable).where(eq(inspectionsTable.buyerId, userId)),
      // Total conversations the buyer is part of
      db
        .select({ n: count() })
        .from(conversationParticipantsTable)
        .innerJoin(conversationsTable, eq(conversationsTable.id, conversationParticipantsTable.conversationId))
        .where(eq(conversationParticipantsTable.userId, userId)),
      // Unread = messages not sent by the buyer, in their conversations, that haven't been read yet
      db
        .select({ n: count() })
        .from(messagesTable)
        .innerJoin(conversationParticipantsTable, and(
          eq(conversationParticipantsTable.conversationId, messagesTable.conversationId),
          eq(conversationParticipantsTable.userId, userId),
        ))
        .where(and(
          eq(messagesTable.isRead, false),
          ne(messagesTable.senderId, userId),
        )),
    ]);

    res.json({
      purchases: purchaseRow[0]?.n ?? 0,
      offers: {
        total: offersTotalRow[0]?.n ?? 0,
        accepted: offersAcceptedRow[0]?.n ?? 0,
        declined: offersRejectedRow[0]?.n ?? 0,
      },
      savedCars: savedRow[0]?.n ?? 0,
      inspections: inspectionRow[0]?.n ?? 0,
      conversations: conversationRow[0]?.n ?? 0,
      unreadMessages: unreadRow[0]?.n ?? 0,
    });
  } catch (err) {
    req.log.error({ err }, "Error loading buyer stats");
    res.status(500).json({ error: "Failed to load buyer stats" });
  }
});

router.delete(
  "/buyer/history/:listingId",
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const listingId = Number(req.params.listingId);
      if (!Number.isInteger(listingId) || listingId <= 0) {
        res.status(400).json({ error: "Invalid listingId" });
        return;
      }
      await db
        .delete(carViewHistoryTable)
        .where(
          and(
            eq(carViewHistoryTable.viewerId, userId),
            eq(carViewHistoryTable.listingId, listingId),
          ),
        );
      res.json({ ok: true });
    } catch (err) {
      req.log.error({ err }, "Error removing history entry");
      res.status(500).json({ error: "Failed to remove history entry" });
    }
  },
);

export default router;
