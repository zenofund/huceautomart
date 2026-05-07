import { Router } from "express";
import {
  db,
  inspectionsTable,
  inspectionReportsTable,
  conversationsTable,
  conversationParticipantsTable,
  messagesTable,
  usersTable,
  sellerProfilesTable,
  listingsTable,
  inspectionTypesTable,
  walletAccountsTable,
  walletTransactionsTable,
  inspectorProfilesTable,
} from "@workspace/db";
import { and, desc, eq, isNotNull, ne, sql, count, sum, inArray } from "drizzle-orm";
import { createNotification } from "../lib/notifications";
import { sendInspectionCompletedBuyerEmail } from "../lib/email";

// Map condition rating → percent for the "Inspection Result" column.
const RATING_PCT: Record<string, number> = {
  excellent: 100,
  good: 75,
  fair: 50,
  poor: 25,
};

// Inverse — pick the condition bucket whose percent is closest to a value.
function percentToCondition(p: number): "excellent" | "good" | "fair" | "poor" {
  if (p >= 88) return "excellent";
  if (p >= 63) return "good";
  if (p >= 38) return "fair";
  return "poor";
}

function computeResultPercent(report: {
  overallCondition: string | null;
  bodyCondition: string | null;
  engineCondition: string | null;
  interiorCondition: string | null;
  electricalCondition: string | null;
  suspensionCondition: string | null;
  tyreCondition: string | null;
} | null): number | null {
  if (!report) return null;
  const ratings = [
    report.overallCondition,
    report.bodyCondition,
    report.engineCondition,
    report.interiorCondition,
    report.electricalCondition,
    report.suspensionCondition,
    report.tyreCondition,
  ]
    .filter((r): r is string => !!r && r in RATING_PCT)
    .map((r) => RATING_PCT[r]);
  if (ratings.length === 0) return null;
  return Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length);
}
import { requireAuth, type AuthRequest } from "../lib/auth-middleware";

const router = Router();

interface InspectorProfilePatchBody {
  officeName?: string | null;
  licenseNumber?: string | null;
  serviceArea?: string | null;
  bio?: string | null;
  isAvailable?: boolean;
}

// ─── GET /inspectors/me/profile ──────────────────────────────────────────────
router.get("/inspectors/me/profile", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const [user] = await db
      .select({ role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    if (!user || user.role !== "inspector") {
      res.status(403).json({ error: "Not an inspector account" });
      return;
    }

    const [profile, totalRow] = await Promise.all([
      db
        .select({
          officeName: inspectorProfilesTable.officeName,
          licenseNumber: inspectorProfilesTable.licenseNumber,
          serviceArea: inspectorProfilesTable.serviceArea,
          bio: inspectorProfilesTable.bio,
          isAvailable: inspectorProfilesTable.isAvailable,
          rating: inspectorProfilesTable.rating,
        })
        .from(inspectorProfilesTable)
        .where(eq(inspectorProfilesTable.userId, userId))
        .limit(1)
        .then((rows) => rows[0]),
      db
        .select({ total: count() })
        .from(inspectionsTable)
        .where(eq(inspectionsTable.inspectorId, userId))
        .limit(1)
        .then((rows) => rows[0]),
    ]);
    const totalInspections = Number(totalRow?.total ?? 0);

    res.json(
      profile
        ? {
            ...profile,
            totalInspections,
          }
        : {
            officeName: null,
            licenseNumber: null,
            serviceArea: null,
            bio: null,
            isAvailable: true,
            rating: 0,
            totalInspections,
          },
    );
  } catch (err) {
    req.log.error({ err }, "Error loading inspector profile");
    res.status(500).json({ error: "Failed to load inspector profile" });
  }
});

// ─── PATCH /inspectors/me/profile ────────────────────────────────────────────
router.patch("/inspectors/me/profile", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const [user] = await db
      .select({ role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    if (!user || user.role !== "inspector") {
      res.status(403).json({ error: "Not an inspector account" });
      return;
    }

    const body = (req.body ?? {}) as InspectorProfilePatchBody;
    const updates: Record<string, unknown> = {};
    const trimOrNull = (v: string | null | undefined) =>
      v == null ? null : String(v).trim() || null;

    if ("officeName" in body) updates.officeName = trimOrNull(body.officeName);
    if ("licenseNumber" in body) updates.licenseNumber = trimOrNull(body.licenseNumber);
    if ("serviceArea" in body) updates.serviceArea = trimOrNull(body.serviceArea);
    if ("bio" in body) updates.bio = trimOrNull(body.bio);
    if ("isAvailable" in body && typeof body.isAvailable === "boolean") {
      updates.isAvailable = body.isAvailable;
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No valid profile changes provided" });
      return;
    }

    updates.updatedAt = new Date();
    const [existing] = await db
      .select({ id: inspectorProfilesTable.id })
      .from(inspectorProfilesTable)
      .where(eq(inspectorProfilesTable.userId, userId))
      .limit(1);

    if (existing) {
      await db
        .update(inspectorProfilesTable)
        .set(updates)
        .where(eq(inspectorProfilesTable.userId, userId));
    } else {
      await db.insert(inspectorProfilesTable).values({
        userId,
        officeName: (updates.officeName as string | null | undefined) ?? null,
        licenseNumber:
          (updates.licenseNumber as string | null | undefined) ?? null,
        serviceArea: (updates.serviceArea as string | null | undefined) ?? null,
        bio: (updates.bio as string | null | undefined) ?? null,
        isAvailable:
          (updates.isAvailable as boolean | undefined) ?? true,
      });
    }

    const [profile] = await db
      .select({
        officeName: inspectorProfilesTable.officeName,
        licenseNumber: inspectorProfilesTable.licenseNumber,
        serviceArea: inspectorProfilesTable.serviceArea,
        bio: inspectorProfilesTable.bio,
        isAvailable: inspectorProfilesTable.isAvailable,
        rating: inspectorProfilesTable.rating,
        totalInspections: inspectorProfilesTable.totalInspections,
      })
      .from(inspectorProfilesTable)
      .where(eq(inspectorProfilesTable.userId, userId))
      .limit(1);

    res.json({ profile });
  } catch (err) {
    req.log.error({ err }, "Error updating inspector profile");
    res.status(500).json({ error: "Failed to update inspector profile" });
  }
});

// ─── GET /inspectors/me/dashboard ────────────────────────────────────────────
// Headline stats for the inspector's Home: total inspections (with active +
// completed badges), revenue earned (sum of inspectorEarnings on completed
// inspections), and direct-message conversation count + unread count.

router.get(
  "/inspectors/me/dashboard",
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;

      const [user] = await db
        .select({ role: usersTable.role })
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);

      if (!user || user.role !== "inspector") {
        res.status(403).json({ error: "Not an inspector account" });
        return;
      }

      const [
        inspectionCounts,
        revenueRow,
        pendingRevenueRow,
        unreadMessagesRow,
        conversationsRow,
      ] = await Promise.all([
        db
          .select({ status: inspectionsTable.status, count: count() })
          .from(inspectionsTable)
          .where(eq(inspectionsTable.inspectorId, userId))
          .groupBy(inspectionsTable.status),

        db
          .select({ total: sum(walletTransactionsTable.amount) })
          .from(walletTransactionsTable)
          .innerJoin(
            walletAccountsTable,
            eq(walletAccountsTable.id, walletTransactionsTable.walletId),
          )
          .where(
            and(
              eq(walletAccountsTable.userId, userId),
              eq(walletTransactionsTable.type, "inspection_earning"),
              eq(walletTransactionsTable.status, "completed"),
            ),
          ),

        db
          .select({ total: sum(inspectionsTable.fee) })
          .from(inspectionsTable)
          .where(
            and(
              eq(inspectionsTable.inspectorId, userId),
              ne(inspectionsTable.status, "completed"),
              ne(inspectionsTable.status, "cancelled"),
              isNotNull(inspectionsTable.paidAt),
            ),
          ),

        db
          .select({ count: count() })
          .from(messagesTable)
          .innerJoin(
            conversationParticipantsTable,
            and(
              eq(
                conversationParticipantsTable.conversationId,
                messagesTable.conversationId,
              ),
              eq(conversationParticipantsTable.userId, userId),
            ),
          )
          .innerJoin(
            conversationsTable,
            eq(conversationsTable.id, messagesTable.conversationId),
          )
          .where(
            and(
              eq(conversationsTable.type, "direct"),
              ne(messagesTable.senderId, userId),
              sql`(${conversationParticipantsTable.lastReadAt} IS NULL
                   OR ${messagesTable.createdAt} > ${conversationParticipantsTable.lastReadAt})`,
            ),
          ),

        db
          .select({ count: count() })
          .from(conversationParticipantsTable)
          .innerJoin(
            conversationsTable,
            eq(conversationsTable.id, conversationParticipantsTable.conversationId),
          )
          .where(
            and(
              eq(conversationParticipantsTable.userId, userId),
              eq(conversationsTable.type, "direct"),
            ),
          ),
      ]);

      const byStatus: Record<string, number> = {};
      for (const r of inspectionCounts) byStatus[r.status] = r.count;
      const total = Object.values(byStatus).reduce((a, b) => a + b, 0);

      const earned = Number(revenueRow[0]?.total ?? 0);
      const pending = Number(pendingRevenueRow[0]?.total ?? 0);

      res.json({
        inspections: {
          total,
          pending: byStatus.pending ?? 0,
          assigned: byStatus.assigned ?? 0,
          active: byStatus.active ?? 0,
          completed: byStatus.completed ?? 0,
          cancelled: byStatus.cancelled ?? 0,
        },
        revenue: {
          earned,
          pending,
          total: earned + pending,
          currency: "NGN",
        },
        messages: {
          conversations: conversationsRow[0]?.count ?? 0,
          unread: unreadMessagesRow[0]?.count ?? 0,
        },
      });
    } catch (err) {
      req.log.error({ err }, "Error fetching inspector dashboard");
      res.status(500).json({ error: "Failed to load dashboard" });
    }
  },
);

// ─── GET /inspectors/me/inspections ──────────────────────────────────────────
// Paginated, joined feed of inspections assigned to the current inspector.

router.get(
  "/inspectors/me/inspections",
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;

      const [user] = await db
        .select({ role: usersTable.role })
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);

      if (!user || user.role !== "inspector") {
        res.status(403).json({ error: "Not an inspector account" });
        return;
      }

      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 10));
      const search = String(req.query.search ?? "").trim().toLowerCase();
      const statusFilter = String(req.query.status ?? "").trim();

      const whereClauses = [eq(inspectionsTable.inspectorId, userId)];
      if (
        statusFilter === "pending" ||
        statusFilter === "assigned" ||
        statusFilter === "active" ||
        statusFilter === "completed" ||
        statusFilter === "cancelled"
      ) {
        whereClauses.push(eq(inspectionsTable.status, statusFilter));
      }

      const rows = await db
        .select({
          id: inspectionsTable.id,
          status: inspectionsTable.status,
          scheduledAt: inspectionsTable.scheduledAt,
          completedAt: inspectionsTable.completedAt,
          location: inspectionsTable.inspectionLocation,
          fee: inspectionsTable.fee,
          earnings: inspectionsTable.inspectorEarnings,
          createdAt: inspectionsTable.createdAt,
          buyerFirstName: usersTable.firstName,
          buyerLastName: usersTable.lastName,
          listingMake: listingsTable.make,
          listingModel: listingsTable.model,
          listingYear: listingsTable.year,
          listingLocation: listingsTable.location,
          sellerId: listingsTable.sellerId,
          sellerBusinessName: sellerProfilesTable.businessName,
          typeName: inspectionTypesTable.name,
          overallCondition: inspectionReportsTable.overallCondition,
          bodyCondition: inspectionReportsTable.bodyCondition,
          engineCondition: inspectionReportsTable.engineCondition,
          interiorCondition: inspectionReportsTable.interiorCondition,
          electricalCondition: inspectionReportsTable.electricalCondition,
          suspensionCondition: inspectionReportsTable.suspensionCondition,
          tyreCondition: inspectionReportsTable.tyreCondition,
        })
        .from(inspectionsTable)
        .innerJoin(usersTable, eq(usersTable.id, inspectionsTable.buyerId))
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
        .where(and(...whereClauses))
        .orderBy(desc(inspectionsTable.createdAt));

      // Pull seller display name as fallback when no business profile exists.
      const sellerIds = Array.from(
        new Set(rows.map((r) => r.sellerId).filter((v): v is number => !!v)),
      );
      const sellerUserMap = new Map<number, string>();
      if (sellerIds.length) {
        const sellerUsers = await db
          .select({
            id: usersTable.id,
            firstName: usersTable.firstName,
            lastName: usersTable.lastName,
          })
          .from(usersTable)
          .where(inArray(usersTable.id, sellerIds));
        for (const u of sellerUsers) {
          sellerUserMap.set(u.id, `${u.firstName} ${u.lastName}`.trim());
        }
      }

      const filtered = search
        ? rows.filter((r) => {
            const buyer = `${r.buyerFirstName} ${r.buyerLastName}`.toLowerCase();
            const car = `${r.listingMake} ${r.listingModel} ${r.listingYear}`.toLowerCase();
            const seller = (
              r.sellerBusinessName ?? sellerUserMap.get(r.sellerId) ?? ""
            ).toLowerCase();
            return (
              buyer.includes(search) ||
              car.includes(search) ||
              seller.includes(search) ||
              String(r.id).includes(search) ||
              (r.typeName ?? "").toLowerCase().includes(search) ||
              (r.location ?? "").toLowerCase().includes(search)
            );
          })
        : rows;

      const total = filtered.length;
      const start = (page - 1) * pageSize;
      const items = filtered.slice(start, start + pageSize).map((r) => {
        const resultPercent = computeResultPercent({
          overallCondition: r.overallCondition,
          bodyCondition: r.bodyCondition,
          engineCondition: r.engineCondition,
          interiorCondition: r.interiorCondition,
          electricalCondition: r.electricalCondition,
          suspensionCondition: r.suspensionCondition,
          tyreCondition: r.tyreCondition,
        });
        return {
          id: r.id,
          status: r.status,
          scheduledAt: r.scheduledAt,
          completedAt: r.completedAt,
          location: r.location,
          fee: Number(r.fee ?? 0),
          earnings: Number(r.earnings ?? 0),
          createdAt: r.createdAt,
          buyerName: `${r.buyerFirstName} ${r.buyerLastName}`.trim(),
          sellerName:
            r.sellerBusinessName ??
            sellerUserMap.get(r.sellerId) ??
            "—",
          carMake: `${r.listingMake} ${r.listingModel} ${r.listingYear}`,
          carDetails: `${r.listingMake} ${r.listingModel}, ${r.listingYear}`,
          type: r.typeName,
          resultPercent,
        };
      });

      res.json({
        items,
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      });
    } catch (err) {
      req.log.error({ err }, "Error fetching inspector inspections");
      res.status(500).json({ error: "Failed to load inspections" });
    }
  },
);

// ─── GET /inspectors/me/inspections/:id ──────────────────────────────────────
// Single inspection detail for the inspector view.

router.get(
  "/inspectors/me/inspections/:id",
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ error: "Invalid inspection id" });
        return;
      }

      const [user] = await db
        .select({
          role: usersTable.role,
          firstName: usersTable.firstName,
          lastName: usersTable.lastName,
        })
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);

      if (!user || user.role !== "inspector") {
        res.status(403).json({ error: "Not an inspector account" });
        return;
      }

      const [row] = await db
        .select({
          id: inspectionsTable.id,
          status: inspectionsTable.status,
          scheduledAt: inspectionsTable.scheduledAt,
          completedAt: inspectionsTable.completedAt,
          location: inspectionsTable.inspectionLocation,
          fee: inspectionsTable.fee,
          earnings: inspectionsTable.inspectorEarnings,
          notes: inspectionsTable.notes,
          buyerNotes: inspectionsTable.buyerNotes,
          createdAt: inspectionsTable.createdAt,
          buyerFirstName: usersTable.firstName,
          buyerLastName: usersTable.lastName,
          listingMake: listingsTable.make,
          listingModel: listingsTable.model,
          listingYear: listingsTable.year,
          sellerId: listingsTable.sellerId,
          sellerBusinessName: sellerProfilesTable.businessName,
          typeName: inspectionTypesTable.name,
          // Report fields (left join)
          reportId: inspectionReportsTable.id,
          overallCondition: inspectionReportsTable.overallCondition,
          summary: inspectionReportsTable.summary,
          bodyCondition: inspectionReportsTable.bodyCondition,
          engineCondition: inspectionReportsTable.engineCondition,
          interiorCondition: inspectionReportsTable.interiorCondition,
          electricalCondition: inspectionReportsTable.electricalCondition,
          suspensionCondition: inspectionReportsTable.suspensionCondition,
          tyreCondition: inspectionReportsTable.tyreCondition,
          recommendedActions: inspectionReportsTable.recommendedActions,
          reportDetails: inspectionReportsTable.reportDetails,
          images: inspectionReportsTable.images,
        })
        .from(inspectionsTable)
        .innerJoin(usersTable, eq(usersTable.id, inspectionsTable.buyerId))
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
            eq(inspectionsTable.inspectorId, userId),
          ),
        )
        .limit(1);

      if (!row) {
        res.status(404).json({ error: "Inspection not found" });
        return;
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

      const resultPercent = computeResultPercent({
        overallCondition: row.overallCondition,
        bodyCondition: row.bodyCondition,
        engineCondition: row.engineCondition,
        interiorCondition: row.interiorCondition,
        electricalCondition: row.electricalCondition,
        suspensionCondition: row.suspensionCondition,
        tyreCondition: row.tyreCondition,
      });

      const ratingPctOrNull = (r: string | null) =>
        r && r in RATING_PCT ? RATING_PCT[r] : null;

      res.json({
        id: row.id,
        status: row.status,
        scheduledAt: row.scheduledAt,
        completedAt: row.completedAt,
        location: row.location ?? null,
        fee: Number(row.fee ?? 0),
        earnings: Number(row.earnings ?? 0),
        type: row.typeName,
        notes: row.notes,
        buyerNotes: row.buyerNotes,
        createdAt: row.createdAt,
        buyerName: `${row.buyerFirstName} ${row.buyerLastName}`.trim(),
        sellerName: sellerName ?? "—",
        carDetails: `${row.listingMake} ${row.listingModel}, ${row.listingYear}`,
        inspectorName: `${user.firstName} ${user.lastName}`.trim(),
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
        resultPercent,
      });
    } catch (err) {
      req.log.error({ err }, "Error fetching inspection detail");
      res.status(500).json({ error: "Failed to load inspection" });
    }
  },
);

// ─── PUT /inspectors/me/inspections/:id/report ───────────────────────────────
// Upsert the inspection report for an inspection assigned to the inspector.
// On success, the inspection is also marked as "completed" with completedAt
// set to now (so revenue tallies, the row moves to the Completed tab, and the
// list reflects the new result percent).

type Condition = "excellent" | "good" | "fair" | "poor";
const CONDITIONS: ReadonlySet<string> = new Set([
  "excellent",
  "good",
  "fair",
  "poor",
]);

interface ReportPayload {
  exterior: Condition;
  interior: Condition;
  engineTransmission: Condition;
  suspensionBrakes: Condition;
  tiresWheels: Condition;
  lightsElectricals: Condition;
  recommendations: string;
  images: string[];
}

function parseReportPayload(raw: unknown): ReportPayload | string {
  if (!raw || typeof raw !== "object") return "Body must be an object";
  const o = raw as Record<string, unknown>;
  const sectionKeys = [
    "exterior",
    "interior",
    "engineTransmission",
    "suspensionBrakes",
    "tiresWheels",
    "lightsElectricals",
  ] as const;
  const result = {} as ReportPayload;
  for (const k of sectionKeys) {
    const v = o[k];
    if (typeof v !== "string" || !CONDITIONS.has(v)) {
      return `${k} must be one of excellent|good|fair|poor`;
    }
    (result as unknown as Record<string, unknown>)[k] = v;
  }
  const rec = o.recommendations;
  result.recommendations =
    typeof rec === "string" ? rec.slice(0, 5000) : "";
  const imgs = o.images;
  if (imgs == null) {
    result.images = [];
  } else if (
    Array.isArray(imgs) &&
    imgs.every((x) => typeof x === "string" && x.length > 0)
  ) {
    result.images = (imgs as string[]).slice(0, 20);
  } else {
    return "images must be an array of strings";
  }
  return result;
}

router.put(
  "/inspectors/me/inspections/:id/report",
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ error: "Invalid inspection id" });
        return;
      }

      const [user] = await db
        .select({ role: usersTable.role })
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);
      if (!user || user.role !== "inspector") {
        res.status(403).json({ error: "Not an inspector account" });
        return;
      }

      const parsed = parseReportPayload(req.body);
      if (typeof parsed === "string") {
        res.status(400).json({ error: parsed });
        return;
      }
      const p = parsed;

      // Confirm ownership of the inspection (and pull fee + linked listing
      // for the wallet credit + transaction description).
      const [inspection] = await db
        .select({
          id: inspectionsTable.id,
          fee: inspectionsTable.fee,
          listingId: inspectionsTable.listingId,
          buyerId: inspectionsTable.buyerId,
        })
        .from(inspectionsTable)
        .where(
          and(
            eq(inspectionsTable.id, id),
            eq(inspectionsTable.inspectorId, userId),
          ),
        )
        .limit(1);
      if (!inspection) {
        res.status(404).json({ error: "Inspection not found" });
        return;
      }

      // Build a friendly description like "Inspection · Toyota Camry 2018".
      let earningDescription = "Inspection Earning";
      let inspectedCarName = "Vehicle";
      if (inspection.listingId) {
        const [listing] = await db
          .select({
            make: listingsTable.make,
            model: listingsTable.model,
            year: listingsTable.year,
          })
          .from(listingsTable)
          .where(eq(listingsTable.id, inspection.listingId))
          .limit(1);
        if (listing) {
          earningDescription = `Inspection · ${listing.make} ${listing.model} ${listing.year}`;
          inspectedCarName = `${listing.make} ${listing.model} ${listing.year}`;
        }
      }

      const sectionPercents = [
        RATING_PCT[p.exterior],
        RATING_PCT[p.interior],
        RATING_PCT[p.engineTransmission],
        RATING_PCT[p.suspensionBrakes],
        RATING_PCT[p.tiresWheels],
        RATING_PCT[p.lightsElectricals],
      ];
      const overallPercent = Math.round(
        sectionPercents.reduce((a, b) => a + b, 0) / sectionPercents.length,
      );
      const overallCondition = percentToCondition(overallPercent);
      const summary =
        p.recommendations.trim() || `Overall condition: ${overallCondition}.`;

      const now = new Date();

      // Atomic upsert (keyed on inspection_id unique constraint) plus the
      // inspection-status flip in the same transaction. This prevents races
      // when two requests submit a result for the same inspection at once and
      // guarantees we never end up with the report saved but the inspection
      // still "active" (or vice-versa).
      await db.transaction(async (tx) => {
        await tx
          .insert(inspectionReportsTable)
          .values({
            inspectionId: id,
            inspectorId: userId,
            overallCondition,
            summary,
            bodyCondition: p.exterior,
            interiorCondition: p.interior,
            engineCondition: p.engineTransmission,
            suspensionCondition: p.suspensionBrakes,
            tyreCondition: p.tiresWheels,
            electricalCondition: p.lightsElectricals,
            recommendedActions: p.recommendations || null,
            images: p.images,
          })
          .onConflictDoUpdate({
            target: inspectionReportsTable.inspectionId,
            set: {
              inspectorId: userId,
              overallCondition,
              summary,
              bodyCondition: p.exterior,
              interiorCondition: p.interior,
              engineCondition: p.engineTransmission,
              suspensionCondition: p.suspensionBrakes,
              tyreCondition: p.tiresWheels,
              electricalCondition: p.lightsElectricals,
              recommendedActions: p.recommendations || null,
              images: p.images,
              updatedAt: now,
            },
          });

        const fee = Number(inspection.fee ?? 0);

        await tx
          .update(inspectionsTable)
          .set({
            status: "completed",
            completedAt: now,
            updatedAt: now,
            inspectorEarnings: fee,
            platformFee: 0,
          })
          .where(eq(inspectionsTable.id, id));

        // Credit the inspector's wallet with the inspection fee. Idempotent:
        // the unique reference `INSPECTION-EARN-<id>` ensures resubmitting
        // the report does not double-credit. We only bump the balance when
        // the insert actually creates a new row.
        if (fee > 0) {
          // Ensure a wallet exists for this inspector.
          const existing = await tx
            .select()
            .from(walletAccountsTable)
            .where(eq(walletAccountsTable.userId, userId))
            .limit(1)
            .then((rows) => rows[0]);
          const wallet =
            existing ??
            (await tx
              .insert(walletAccountsTable)
              .values({ userId, balance: 0, currency: "NGN" })
              .returning()
              .then((rows) => rows[0]));

          // Reserve idempotency first with a placeholder row using the unique
          // reference. If another concurrent submission already credited this
          // inspection, this insert is a no-op and we skip the balance bump.
          const reference = `INSPECTION-EARN-${id}`;
          const reserved = await tx
            .insert(walletTransactionsTable)
            .values({
              walletId: wallet.id,
              type: "inspection_earning",
              amount: fee,
              status: "completed",
              reference,
              description: earningDescription,
            })
            .onConflictDoNothing({ target: walletTransactionsTable.reference })
            .returning();

          if (reserved.length > 0) {
            // Atomically credit the wallet and read the new balance back.
            const [credited] = await tx
              .update(walletAccountsTable)
              .set({
                balance: sql`${walletAccountsTable.balance} + ${fee}`,
                updatedAt: now,
              })
              .where(eq(walletAccountsTable.id, wallet.id))
              .returning();
            const balanceAfter = credited.balance;
            const balanceBefore = balanceAfter - fee;
            await tx
              .update(walletTransactionsTable)
              .set({ balanceBefore, balanceAfter })
              .where(eq(walletTransactionsTable.id, reserved[0].id));
          }
        }
      });

      void createNotification({
        userId: inspection.buyerId,
        type: "inspection_submitted",
        title: "Inspection report is ready",
        message: "Your vehicle inspection report has been submitted by the inspector.",
        entityType: "inspection",
        entityId: id,
        priority: "high",
      }).catch(() => {});

      const [buyer] = await db
        .select({
          email: usersTable.email,
          firstName: usersTable.firstName,
        })
        .from(usersTable)
        .where(eq(usersTable.id, inspection.buyerId))
        .limit(1);
      if (buyer) {
        void sendInspectionCompletedBuyerEmail({
          email: buyer.email,
          firstName: buyer.firstName || "Buyer",
          inspectionId: id,
          carName: inspectedCarName,
        }).catch(() => {});
      }

      res.json({ ok: true, overallPercent, overallCondition });
    } catch (err) {
      req.log.error({ err }, "Error saving inspection report");
      res.status(500).json({ error: "Failed to save inspection report" });
    }
  },
);

export default router;
