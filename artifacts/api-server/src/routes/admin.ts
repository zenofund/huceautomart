import { Router } from "express";
import bcrypt from "bcryptjs";
import {
  db,
  usersTable,
  listingsTable,
  offersTable,
  inspectionsTable,
  inspectionTypesTable,
  sellerProfilesTable,
  buyerProfilesTable,
  inspectorProfilesTable,
  supportTicketsTable,
  supportTicketMessagesTable,
  purchasesTable,
  inspectionReportsTable,
  conversationsTable,
  conversationParticipantsTable,
  messagesTable,
  reviewsTable,
  carCategoriesTable,
  listingImagesTable,
  carFeaturesTable,
  listingFeatureLinksTable,
  listingDeletionRequestsTable,
  subscriptionPlansTable,
  subscriptionsTable,
  walletTransactionsTable,
  walletAccountsTable,
  paymentIntentsTable,
  cmsNewsTable,
  cmsBannersTable,
  testimonialsTable,
  pushMessagesTable,
  bankAccountsTable,
  auditLogsTable,
  financeSettingsTable,
} from "@workspace/db";
import { eq, sql, desc, asc, and, gte, inArray, ilike, or, count, ne, isNull, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { requireAdmin, type AuthRequest } from "../lib/auth-middleware";
import { autoAssignInspector } from "../lib/inspectorAssignment";
import { createNotification, createRoleNotifications } from "../lib/notifications";
import { sendInspectionAssignedEmail } from "../lib/email";
import { deleteManagedMediaRef } from "../lib/mediaCleanup";
import { createTransferRecipient, initiateTransfer } from "../lib/paystack";

const router = Router();

function requestIp(req: AuthRequest): string | null {
  const xf = req.headers["x-forwarded-for"];
  const raw = Array.isArray(xf) ? xf[0] : xf;
  const first = typeof raw === "string" ? raw.split(",")[0]?.trim() : "";
  return first || req.ip || null;
}

async function writeAuditLog(params: {
  userId?: number | null;
  action: string;
  resourceType?: string | null;
  resourceId?: number | null;
  details?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  await db.insert(auditLogsTable).values({
    userId: params.userId ?? null,
    action: params.action,
    resourceType: params.resourceType ?? null,
    resourceId: params.resourceId ?? null,
    details: params.details ?? {},
    ipAddress: params.ipAddress ?? null,
    userAgent: params.userAgent ?? null,
  });
}

function normalizeListingImageUrl(url: string): string {
  const v = String(url ?? "").trim();
  if (!v) return v;
  if (/^https?:\/\//i.test(v) || v.startsWith("/api/")) return v;
  if (v.startsWith("/objects/") || v.startsWith("/local/")) return `/api/storage${v}`;
  if (v.startsWith("/storage/")) return `/api${v}`;
  return v;
}

function imagePriority(url: string): number {
  const v = String(url ?? "").toLowerCase();
  if (v.includes("/api/storage/local/")) return 0;
  if (v.includes("/api/storage/objects/")) return 1;
  if (v.includes("storage.googleapis.com")) return 2;
  if (v.includes("images.unsplash.com")) return 9;
  return 5;
}

function tokenizeLocation(value: string): string[] {
  return String(value ?? "")
    .toLowerCase()
    .split(/[\s,\-/]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3);
}

function isSameLocationMatch(target: string | null | undefined, candidate: string | null | undefined): boolean {
  const targetWords = tokenizeLocation(target ?? "");
  const candidateWords = tokenizeLocation(candidate ?? "");
  if (targetWords.length === 0 || candidateWords.length === 0) return false;
  return targetWords.some((tw) =>
    candidateWords.some((cw) => cw.includes(tw) || tw.includes(cw)),
  );
}

let didEnsureAppReviewSchema = false;
async function ensureAppReviewSchema() {
  if (didEnsureAppReviewSchema) return;
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE testimonial_status AS ENUM ('pending', 'approved', 'rejected');
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS testimonials (
      id serial PRIMARY KEY,
      user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role text NOT NULL,
      rating integer NOT NULL,
      title text NOT NULL,
      comment text NOT NULL,
      status testimonial_status NOT NULL DEFAULT 'pending',
      admin_note text,
      approved_by integer REFERENCES users(id) ON DELETE SET NULL,
      approved_at timestamp,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    );
  `);
  didEnsureAppReviewSchema = true;
}

function computeSellerApprovalProgress(input: {
  profilePhotoUrl: string | null;
  businessName: string | null;
  ninNumber: string | null;
  ninDocumentUrl: string | null;
  proofOfAddressUrl: string | null;
  isVerified: boolean | null;
  hasBankAccount: boolean;
}) {
  if (input.isVerified) {
    return {
      nin: "completed",
      proof: "completed",
      bank: "completed",
      profile: "completed",
      completedCount: 4,
      totalCount: 4,
      allCompleted: true,
    } as const;
  }

  const ninDone = !!input.ninNumber && !!input.ninDocumentUrl;
  const proofDone = !!input.proofOfAddressUrl;
  const bankDone = input.hasBankAccount;
  const profileDone = !!input.profilePhotoUrl || !!input.businessName;

  const completedCount = [ninDone, proofDone, bankDone, profileDone].filter(Boolean).length;
  return {
    nin: ninDone ? "completed" : "pending",
    proof: proofDone ? "completed" : "pending",
    bank: bankDone ? "completed" : "pending",
    profile: profileDone ? "completed" : "pending",
    completedCount,
    totalCount: 4,
    allCompleted: completedCount === 4,
  } as const;
}

router.get("/admin/stats/overview", requireAdmin, async (_req: AuthRequest, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const [
      [users],
      [usersThisMonth],
      [usersPrevMonth],
      [buyers],
      [sellers],
      [inspectors],
      [listings],
      [activeListings],
      [soldListings],
      [pendingListings],
      [offers],
      [acceptedOffers],
      [purchaseFeesRow],
      [subFeesRow],
      [escrowFeesRow],
      [inspectionsRow],
      [pendingInspections],
      [ticketsTotal],
      [ticketsResolved],
      [ticketsOpen],
    ] = await Promise.all([
      db.select({ c: sql<number>`count(*)::int` }).from(usersTable),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(usersTable)
        .where(gte(usersTable.createdAt, startOfMonth)),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(usersTable)
        .where(
          and(
            gte(usersTable.createdAt, startOfPrevMonth),
            sql`${usersTable.createdAt} < ${startOfMonth}`,
          ),
        ),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(usersTable)
        .where(eq(usersTable.role, "buyer")),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(usersTable)
        .where(eq(usersTable.role, "seller")),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(usersTable)
        .where(eq(usersTable.role, "inspector")),
      db.select({ c: sql<number>`count(*)::int` }).from(listingsTable),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(listingsTable)
        .where(eq(listingsTable.status, "active")),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(listingsTable)
        .where(eq(listingsTable.status, "sold")),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(listingsTable)
        .where(eq(listingsTable.status, "pending")),
      db.select({ c: sql<number>`count(*)::int` }).from(offersTable),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(offersTable)
        .where(eq(offersTable.status, "accepted")),
      db
        .select({
          total: sql<number>`COALESCE(SUM(${purchasesTable.platformFee}), 0)::float`,
        })
        .from(purchasesTable)
        .where(eq(purchasesTable.paymentStatus, "completed")),
      db
        .select({
          total: sql<number>`COALESCE(SUM(${subscriptionPlansTable.price}), 0)::float`,
        })
        .from(subscriptionsTable)
        .innerJoin(subscriptionPlansTable, eq(subscriptionPlansTable.id, subscriptionsTable.planId)),
      db
        .select({
          total: sql<number>`COALESCE(SUM(CAST(${walletTransactionsTable.metadata}->>'escrowFeeAmount' AS numeric)), 0)::float`,
        })
        .from(walletTransactionsTable)
        .where(
          and(
            eq(walletTransactionsTable.type, "withdrawal"),
            eq(walletTransactionsTable.status, "completed")
          )
        ),
      db.select({ c: sql<number>`count(*)::int` }).from(inspectionsTable),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(inspectionsTable)
        .where(eq(inspectionsTable.status, "pending")),
      db.select({ c: sql<number>`count(*)::int` }).from(supportTicketsTable),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(supportTicketsTable)
        .where(eq(supportTicketsTable.status, "resolved")),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(supportTicketsTable)
        .where(eq(supportTicketsTable.status, "open")),
    ]);

    const usersThis = usersThisMonth?.c ?? 0;
    const usersPrev = usersPrevMonth?.c ?? 0;
    const userGrowthPct =
      usersPrev > 0
        ? Math.round(((usersThis - usersPrev) / usersPrev) * 100)
        : usersThis > 0
          ? 100
          : 0;

    res.json({
      users: {
        total: users?.c ?? 0,
        buyers: buyers?.c ?? 0,
        sellers: sellers?.c ?? 0,
        inspectors: inspectors?.c ?? 0,
        thisMonth: usersThis,
        growthPct: userGrowthPct,
      },
      listings: {
        total: listings?.c ?? 0,
        active: activeListings?.c ?? 0,
        sold: soldListings?.c ?? 0,
        pending: pendingListings?.c ?? 0,
      },
      offers: {
        total: offers?.c ?? 0,
        accepted: acceptedOffers?.c ?? 0,
      },
      revenue: {
        total: (purchaseFeesRow?.total ?? 0) + (subFeesRow?.total ?? 0) + (escrowFeesRow?.total ?? 0),
      },
      inspections: {
        total: inspectionsRow?.c ?? 0,
        pending: pendingInspections?.c ?? 0,
      },
      tickets: {
        total: ticketsTotal?.c ?? 0,
        resolved: ticketsResolved?.c ?? 0,
        unresolved: ticketsOpen?.c ?? 0,
      },
    });
  } catch (err) {
    console.error("admin stats error", err);
    res.status(500).json({ error: "Failed to fetch admin stats" });
  }
});

router.get("/admin/recent/users", requireAdmin, async (_req: AuthRequest, res) => {
  try {
    const rows = await db
      .select({
        id: usersTable.id,
        email: usersTable.email,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        role: usersTable.role,
        status: usersTable.status,
        createdAt: usersTable.createdAt,
      })
      .from(usersTable)
      .orderBy(desc(usersTable.createdAt))
      .limit(8);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch recent users" });
  }
});

router.get("/admin/recent/listings", requireAdmin, async (_req: AuthRequest, res) => {
  try {
    const rows = await db
      .select({
        id: listingsTable.id,
        make: listingsTable.make,
        model: listingsTable.model,
        year: listingsTable.year,
        price: listingsTable.price,
        status: listingsTable.status,
        createdAt: listingsTable.createdAt,
        sellerName: sql<string>`${sellerProfilesTable.businessName}`,
      })
      .from(listingsTable)
      .leftJoin(
        sellerProfilesTable,
        eq(listingsTable.sellerId, sellerProfilesTable.userId),
      )
      .orderBy(desc(listingsTable.createdAt))
      .limit(8);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch recent listings" });
  }
});

router.get("/admin/stats/revenue-trend", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const yearParam = parseInt(String(req.query.year ?? ""), 10);
    const year = Number.isFinite(yearParam) ? yearParam : new Date().getFullYear();

    const rows = await db
      .select({
        month: sql<number>`extract(month from ${purchasesTable.createdAt})::int`,
        total: sql<number>`coalesce(sum(${purchasesTable.amount}), 0)::float`,
      })
      .from(purchasesTable)
      .where(
        and(
          eq(purchasesTable.paymentStatus, "completed"),
          sql`extract(year from ${purchasesTable.createdAt}) = ${year}`,
        ),
      )
      .groupBy(sql`extract(month from ${purchasesTable.createdAt})`);

    const totals = new Array(12).fill(0);
    for (const r of rows) totals[r.month - 1] = Number(r.total) || 0;

    const labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const series = labels.map((m, i) => ({ month: m, value: totals[i] }));
    const total = totals.reduce((a, b) => a + b, 0);

    const prevYearRow = await db
      .select({ total: sql<number>`coalesce(sum(${purchasesTable.amount}), 0)::float` })
      .from(purchasesTable)
      .where(
        and(
          eq(purchasesTable.paymentStatus, "completed"),
          sql`extract(year from ${purchasesTable.createdAt}) = ${year - 1}`,
        ),
      );
    const prev = Number(prevYearRow[0]?.total ?? 0);
    const growthPct = prev > 0 ? Math.round(((total - prev) / prev) * 100) : total > 0 ? 100 : 0;

    res.json({ year, series, total, growthPct });
  } catch (err) {
    console.error("admin revenue-trend error", err);
    res.status(500).json({ error: "Failed to fetch revenue trend" });
  }
});

router.get("/admin/stats/listings-week", requireAdmin, async (_req: AuthRequest, res) => {
  try {
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - 6);
    start.setHours(0, 0, 0, 0);

    const rows = await db
      .select({
        dow: sql<number>`extract(dow from ${listingsTable.createdAt})::int`,
        c: sql<number>`count(*)::int`,
      })
      .from(listingsTable)
      .where(gte(listingsTable.createdAt, start))
      .groupBy(sql`extract(dow from ${listingsTable.createdAt})`);

    const counts = new Array(7).fill(0);
    for (const r of rows) counts[r.dow] = Number(r.c) || 0;

    const labels = ["S", "M", "T", "W", "T", "F", "S"];
    const series = labels.map((d, i) => ({ day: d, value: counts[i] }));

    const [totalRow] = await db.select({ c: sql<number>`count(*)::int` }).from(listingsTable);
    const total = totalRow?.c ?? 0;

    const prevStart = new Date(start);
    prevStart.setDate(prevStart.getDate() - 7);
    const prevEnd = new Date(start);

    const [prevRow] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(listingsTable)
      .where(and(gte(listingsTable.createdAt, prevStart), sql`${listingsTable.createdAt} < ${prevEnd}`));
    const [thisRow] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(listingsTable)
      .where(gte(listingsTable.createdAt, start));

    const prev = prevRow?.c ?? 0;
    const cur = thisRow?.c ?? 0;
    const changePct = prev > 0 ? Math.round(((cur - prev) / prev) * 100) : cur > 0 ? 100 : 0;

    res.json({ series, total, changePct });
  } catch (err) {
    console.error("admin listings-week error", err);
    res.status(500).json({ error: "Failed to fetch weekly listings" });
  }
});

router.get("/admin/stats/best-dealers", requireAdmin, async (_req: AuthRequest, res) => {
  try {
    // Base seller listing stats
    const listingRows = await db
      .select({
        sellerId: listingsTable.sellerId,
        sellerName: sellerProfilesTable.businessName,
        totalListings: sql<number>`count(${listingsTable.id})::int`,
      })
      .from(listingsTable)
      .leftJoin(sellerProfilesTable, eq(sellerProfilesTable.userId, listingsTable.sellerId))
      .groupBy(listingsTable.sellerId, sellerProfilesTable.businessName);

    const sellerIds = listingRows.map((r) => r.sellerId);
    if (sellerIds.length === 0) {
      res.json([]);
      return;
    }

    // Source-of-truth sales/earnings from completed purchases (not offer acceptance).
    const purchaseRows = await db
      .select({
        sellerId: purchasesTable.sellerId,
        totalSold: sql<number>`count(${purchasesTable.id})::int`,
        earnings: sql<number>`coalesce(sum(${purchasesTable.amount}), 0)::float`,
      })
      .from(purchasesTable)
      .where(
        and(
          inArray(purchasesTable.sellerId, sellerIds),
          eq(purchasesTable.paymentStatus, "completed"),
        ),
      )
      .groupBy(purchasesTable.sellerId);

    const offerRows = await db
      .select({
        sellerId: listingsTable.sellerId,
        offers: sql<number>`count(${offersTable.id})::int`,
      })
      .from(offersTable)
      .innerJoin(listingsTable, eq(offersTable.listingId, listingsTable.id))
      .where(inArray(listingsTable.sellerId, sellerIds))
      .groupBy(listingsTable.sellerId);

    const purchasesBySeller = new Map(
      purchaseRows.map((r) => [r.sellerId, { totalSold: r.totalSold, earnings: r.earnings }]),
    );
    const offersBySeller = new Map(offerRows.map((r) => [r.sellerId, r.offers]));

    const payload = listingRows
      .map((r) => {
        const sold = Number(purchasesBySeller.get(r.sellerId)?.totalSold ?? 0);
        const total = Number(r.totalListings ?? 0);
        return {
          sellerId: r.sellerId,
          sellerName: r.sellerName ?? "Unknown",
          totalSold: sold,
          totalUnsold: Math.max(0, total - sold),
          offers: Number(offersBySeller.get(r.sellerId) ?? 0),
          earnings: Number(purchasesBySeller.get(r.sellerId)?.earnings ?? 0),
        };
      })
      .sort((a, b) => {
        if (b.totalSold !== a.totalSold) return b.totalSold - a.totalSold;
        return b.earnings - a.earnings;
      })
      .slice(0, 5);

    res.json(payload);
  } catch (err) {
    console.error("admin best-dealers error", err);
    res.status(500).json({ error: "Failed to fetch best dealers" });
  }
});

router.get("/admin/users", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const role = String(req.query.role ?? "all") as
      | "all"
      | "buyer"
      | "seller"
      | "inspector"
      | "admin";
    const search = String(req.query.search ?? "").trim();
    const status = String(req.query.status ?? "").trim();
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(String(req.query.pageSize ?? "10"), 10) || 10),
    );

    const conditions: SQL[] = [];
    if (role !== "all") {
      conditions.push(eq(usersTable.role, role));
    }
    if (search) {
      conditions.push(
        or(
          ilike(usersTable.email, `%${search}%`),
          ilike(usersTable.firstName, `%${search}%`),
          ilike(usersTable.lastName, `%${search}%`),
          ilike(usersTable.phone, `%${search}%`),
        )!,
      );
    }
    if (status === "active" || status === "inactive" || status === "suspended") {
      conditions.push(eq(usersTable.status, status));
    } else if (status === "non_active") {
      conditions.push(ne(usersTable.status, "active"));
    }
    const where = conditions.length > 1 ? and(...conditions) : conditions[0] ?? undefined;

    const [{ c: total }] = await db
      .select({ c: count() })
      .from(usersTable)
      .where(where as SQL | undefined);

    const baseRowsRaw = await db
      .select({
        id: usersTable.id,
        role: usersTable.role,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        email: usersTable.email,
        phone: usersTable.phone,
        status: usersTable.status,
        profilePhotoUrl: usersTable.profilePhotoUrl,
        createdAt: usersTable.createdAt,
        businessName: role === "seller" ? sellerProfilesTable.businessName : sql<string | null>`null`,
        officeName: role === "inspector" ? inspectorProfilesTable.officeName : sql<string | null>`null`,
      })
      .from(usersTable)
      .leftJoin(
        sellerProfilesTable,
        role === "seller" || role === "all"
          ? eq(sellerProfilesTable.userId, usersTable.id)
          : sql`false`,
      )
      .leftJoin(
        inspectorProfilesTable,
        role === "inspector" || role === "all"
          ? eq(inspectorProfilesTable.userId, usersTable.id)
          : sql`false`,
      )
      .where(where as SQL | undefined)
      .orderBy(desc(usersTable.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const baseRows = baseRowsRaw;
    const ids = baseRows.map((u) => u.id);
    type Metric = { metric1: number; metric2: number };
    const metrics = new Map<number, Metric>();

    if (ids.length > 0) {
      if (role === "buyer") {
        const offerCounts = await db
          .select({
            id: offersTable.buyerId,
            c: sql<number>`count(*)::int`,
          })
          .from(offersTable)
          .where(inArray(offersTable.buyerId, ids))
          .groupBy(offersTable.buyerId);
        const purchaseCounts = await db
          .select({
            id: purchasesTable.buyerId,
            c: sql<number>`count(*)::int`,
          })
          .from(purchasesTable)
          .where(inArray(purchasesTable.buyerId, ids))
          .groupBy(purchasesTable.buyerId);
        for (const id of ids) metrics.set(id, { metric1: 0, metric2: 0 });
        for (const r of offerCounts)
          metrics.get(r.id)!.metric1 = Number(r.c) || 0;
        for (const r of purchaseCounts)
          metrics.get(r.id)!.metric2 = Number(r.c) || 0;
      } else if (role === "seller") {
        const listingCounts = await db
          .select({
            id: listingsTable.sellerId,
            total: sql<number>`count(*)::int`,
            sold: sql<number>`count(*) filter (where ${listingsTable.status} = 'sold')::int`,
          })
          .from(listingsTable)
          .where(inArray(listingsTable.sellerId, ids))
          .groupBy(listingsTable.sellerId);
        for (const id of ids) metrics.set(id, { metric1: 0, metric2: 0 });
        for (const r of listingCounts)
          metrics.set(r.id, {
            metric1: Number(r.total) || 0,
            metric2: Number(r.sold) || 0,
          });
      } else if (role === "inspector") {
        const inspectionCounts = await db
          .select({
            id: inspectionsTable.inspectorId,
            total: sql<number>`count(*)::int`,
            done: sql<number>`count(*) filter (where ${inspectionsTable.status} = 'completed')::int`,
          })
          .from(inspectionsTable)
          .where(inArray(inspectionsTable.inspectorId, ids))
          .groupBy(inspectionsTable.inspectorId);
        for (const id of ids) metrics.set(id, { metric1: 0, metric2: 0 });
        for (const r of inspectionCounts)
          if (r.id != null)
            metrics.set(r.id, {
              metric1: Number(r.total) || 0,
              metric2: Number(r.done) || 0,
            });
      }
    }

    const items = baseRows.map((u) => ({
      ...u,
      metric1: metrics.get(u.id)?.metric1 ?? 0,
      metric2: metrics.get(u.id)?.metric2 ?? 0,
    }));

    res.json({ items, total: Number(total), page, pageSize });
  } catch (err) {
    console.error("admin users error", err);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

router.post("/admin/users", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const body = req.body ?? {};
    const firstName = String(body.firstName ?? "").trim();
    const lastName = String(body.lastName ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const role = String(body.role ?? "buyer") as "buyer" | "seller" | "inspector" | "admin";
    const status = String(body.status ?? "active") as
      | "active"
      | "inactive"
      | "suspended"
      | "pending_verification";
    const password = String(body.password ?? "");

    if (!firstName || !lastName || !email || !password) {
      res.status(400).json({ error: "First name, last name, email and password are required" });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: "Invalid email" });
      return;
    }
    if (!["buyer", "seller", "inspector", "admin"].includes(role)) {
      res.status(400).json({ error: "Invalid role" });
      return;
    }
    if (!["active", "inactive", "suspended", "pending_verification"].includes(status)) {
      res.status(400).json({ error: "Invalid status" });
      return;
    }
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      res.status(400).json({
        error: "Password must be at least 8 characters and contain letters and numbers",
      });
      return;
    }

    const [exists] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);
    if (exists) {
      res.status(409).json({ error: "Email already in use" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const [created] = await db
      .insert(usersTable)
      .values({
        firstName,
        lastName,
        email,
        phone: phone || null,
        role,
        status,
        passwordHash,
        emailVerified: true,
      })
      .returning({
        id: usersTable.id,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        email: usersTable.email,
        phone: usersTable.phone,
        role: usersTable.role,
        status: usersTable.status,
        createdAt: usersTable.createdAt,
      });

    await writeAuditLog({
      userId: created.id,
      action: "ADMIN_USER_CREATED",
      resourceType: "user",
      resourceId: created.id,
      details: {
        adminId: req.user!.userId,
        role: created.role,
        status: created.status,
      },
      ipAddress: requestIp(req),
      userAgent: req.get("user-agent") ?? null,
    });

    res.status(201).json({ user: created });
  } catch (err) {
    console.error("admin user create error", err);
    res.status(500).json({ error: "Failed to create user" });
  }
});

router.get("/admin/settings/seller-approvals", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const search = String(req.query.search ?? "").trim();
    const status = String(req.query.status ?? "all").trim().toLowerCase();
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(String(req.query.pageSize ?? "10"), 10) || 10),
    );

    const conditions: SQL[] = [eq(usersTable.role, "seller")];
    if (search) {
      conditions.push(
        or(
          ilike(usersTable.email, `%${search}%`),
          ilike(usersTable.firstName, `%${search}%`),
          ilike(usersTable.lastName, `%${search}%`),
          ilike(usersTable.phone, `%${search}%`),
          ilike(sellerProfilesTable.businessName, `%${search}%`),
        )!,
      );
    }

    if (status === "verified") {
      conditions.push(
        or(
          eq(sellerProfilesTable.isVerified, true),
          eq(sellerProfilesTable.verificationStatus, "verified"),
        )!,
      );
    } else if (status === "rejected") {
      conditions.push(eq(sellerProfilesTable.verificationStatus, "rejected"));
    } else if (status === "pending") {
      conditions.push(
        and(
          ne(sellerProfilesTable.isVerified, true),
          or(
            isNull(sellerProfilesTable.verificationStatus),
            eq(sellerProfilesTable.verificationStatus, "pending"),
            eq(sellerProfilesTable.verificationStatus, "unverified"),
          )!,
        )!,
      );
    }

    const where = conditions.length > 1 ? and(...conditions) : conditions[0];

    const [{ c: total }] = await db
      .select({ c: count() })
      .from(usersTable)
      .leftJoin(sellerProfilesTable, eq(sellerProfilesTable.userId, usersTable.id))
      .where(where);

    const rows = await db
      .select({
        id: usersTable.id,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        email: usersTable.email,
        phone: usersTable.phone,
        profilePhotoUrl: usersTable.profilePhotoUrl,
        userStatus: usersTable.status,
        createdAt: usersTable.createdAt,
        businessName: sellerProfilesTable.businessName,
        ninNumber: sellerProfilesTable.ninNumber,
        ninDocumentUrl: sellerProfilesTable.ninDocumentUrl,
        proofOfAddressUrl: sellerProfilesTable.proofOfAddressUrl,
        verificationStatus: sellerProfilesTable.verificationStatus,
        isVerified: sellerProfilesTable.isVerified,
      })
      .from(usersTable)
      .leftJoin(sellerProfilesTable, eq(sellerProfilesTable.userId, usersTable.id))
      .where(where)
      .orderBy(desc(usersTable.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const sellerIds = rows.map((r) => r.id);
    const bankCounts = sellerIds.length
      ? await db
          .select({
            userId: bankAccountsTable.userId,
            c: count(),
          })
          .from(bankAccountsTable)
          .where(inArray(bankAccountsTable.userId, sellerIds))
          .groupBy(bankAccountsTable.userId)
      : [];
    const hasBankMap = new Map<number, boolean>();
    for (const b of bankCounts) hasBankMap.set(b.userId, Number(b.c) > 0);

    const items = rows.map((r) => {
      const progress = computeSellerApprovalProgress({
        profilePhotoUrl: r.profilePhotoUrl,
        businessName: r.businessName,
        ninNumber: r.ninNumber,
        ninDocumentUrl: r.ninDocumentUrl,
        proofOfAddressUrl: r.proofOfAddressUrl,
        isVerified: r.isVerified,
        hasBankAccount: Boolean(hasBankMap.get(r.id)),
      });

      const effectiveStatus =
        r.isVerified || r.verificationStatus === "verified"
          ? "verified"
          : r.verificationStatus === "rejected"
            ? "rejected"
            : "pending";

      return {
        id: r.id,
        firstName: r.firstName,
        lastName: r.lastName,
        email: r.email,
        phone: r.phone,
        userStatus: r.userStatus,
        createdAt: r.createdAt,
        businessName: r.businessName,
        verificationStatus: effectiveStatus,
        progress,
      };
    });

    res.json({ items, total: Number(total), page, pageSize });
  } catch (err) {
    console.error("admin seller approvals list error", err);
    res.status(500).json({ error: "Failed to fetch seller approvals" });
  }
});

router.get("/admin/settings/seller-approvals/:id", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const [row] = await db
      .select({
        id: usersTable.id,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        email: usersTable.email,
        phone: usersTable.phone,
        profilePhotoUrl: usersTable.profilePhotoUrl,
        userStatus: usersTable.status,
        createdAt: usersTable.createdAt,
        businessName: sellerProfilesTable.businessName,
        location: sellerProfilesTable.location,
        ninNumber: sellerProfilesTable.ninNumber,
        ninDocumentUrl: sellerProfilesTable.ninDocumentUrl,
        proofOfAddressUrl: sellerProfilesTable.proofOfAddressUrl,
        verificationStatus: sellerProfilesTable.verificationStatus,
        isVerified: sellerProfilesTable.isVerified,
      })
      .from(usersTable)
      .leftJoin(sellerProfilesTable, eq(sellerProfilesTable.userId, usersTable.id))
      .where(and(eq(usersTable.id, id), eq(usersTable.role, "seller")))
      .limit(1);

    if (!row) {
      res.status(404).json({ error: "Seller not found" });
      return;
    }

    const [bankRow] = await db
      .select({
        id: bankAccountsTable.id,
        bankName: bankAccountsTable.bankName,
        accountNumber: bankAccountsTable.accountNumber,
        accountName: bankAccountsTable.accountName,
      })
      .from(bankAccountsTable)
      .where(eq(bankAccountsTable.userId, id))
      .orderBy(desc(bankAccountsTable.isDefault), desc(bankAccountsTable.updatedAt))
      .limit(1);
    const hasBankAccount = Boolean(bankRow);

    const progress = computeSellerApprovalProgress({
      profilePhotoUrl: row.profilePhotoUrl,
      businessName: row.businessName,
      ninNumber: row.ninNumber,
      ninDocumentUrl: row.ninDocumentUrl,
      proofOfAddressUrl: row.proofOfAddressUrl,
      isVerified: row.isVerified,
      hasBankAccount,
    });

    const effectiveStatus =
      row.isVerified || row.verificationStatus === "verified"
        ? "verified"
        : row.verificationStatus === "rejected"
          ? "rejected"
          : "pending";

    res.json({
      ...row,
      bankName: bankRow?.bankName ?? null,
      bankAccountNumber: bankRow?.accountNumber ?? null,
      bankAccountName: bankRow?.accountName ?? null,
      verificationStatus: effectiveStatus,
      hasBankAccount,
      progress,
    });
  } catch (err) {
    console.error("admin seller approval detail error", err);
    res.status(500).json({ error: "Failed to fetch seller approval details" });
  }
});

router.patch("/admin/settings/seller-approvals/:id", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const action = String(req.body?.action ?? "").trim().toLowerCase();
    if (action !== "approve" && action !== "reject") {
      res.status(400).json({ error: "Action must be approve or reject" });
      return;
    }

    const [user] = await db
      .select({ id: usersTable.id, role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.id, id))
      .limit(1);
    if (!user || user.role !== "seller") {
      res.status(404).json({ error: "Seller not found" });
      return;
    }

    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: sellerProfilesTable.id })
        .from(sellerProfilesTable)
        .where(eq(sellerProfilesTable.userId, id))
        .limit(1);

      const profilePatch =
        action === "approve"
          ? {
              isVerified: true,
              verificationStatus: "verified" as const,
              updatedAt: new Date(),
            }
          : {
              isVerified: false,
              verificationStatus: "rejected" as const,
              updatedAt: new Date(),
            };

      if (existing) {
        await tx
          .update(sellerProfilesTable)
          .set(profilePatch)
          .where(eq(sellerProfilesTable.userId, id));
      } else {
        await tx.insert(sellerProfilesTable).values({
          userId: id,
          ...profilePatch,
        });
      }

      await tx
        .update(usersTable)
        .set({
          status: action === "approve" ? "active" : "pending_verification",
          updatedAt: new Date(),
        })
        .where(eq(usersTable.id, id));
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("admin seller approval action error", err);
    res.status(500).json({ error: "Failed to process seller approval action" });
  }
});

router.get("/admin/users/:id", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [user] = await db
      .select({
        id: usersTable.id,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        email: usersTable.email,
        phone: usersTable.phone,
        role: usersTable.role,
        status: usersTable.status,
        profilePhotoUrl: usersTable.profilePhotoUrl,
        createdAt: usersTable.createdAt,
        updatedAt: usersTable.updatedAt,
      })
      .from(usersTable)
      .where(eq(usersTable.id, id));
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const stats: Record<string, number> = {};
    if (user.role === "buyer") {
      const [o] = await db
        .select({ c: count() })
        .from(offersTable)
        .where(eq(offersTable.buyerId, id));
      const [p] = await db
        .select({ c: count() })
        .from(purchasesTable)
        .where(eq(purchasesTable.buyerId, id));
      const [i] = await db
        .select({ c: count() })
        .from(inspectionsTable)
        .where(eq(inspectionsTable.buyerId, id));
      stats.offersSubmitted = Number(o?.c ?? 0);
      stats.totalPurchases = Number(p?.c ?? 0);
      stats.inspections = Number(i?.c ?? 0);
    } else if (user.role === "seller") {
      const [l] = await db
        .select({
          total: sql<number>`count(*)::int`,
          sold: sql<number>`count(*) filter (where ${listingsTable.status} = 'sold')::int`,
        })
        .from(listingsTable)
        .where(eq(listingsTable.sellerId, id));
      const [o] = await db
        .select({ c: count() })
        .from(offersTable)
        .where(eq(offersTable.sellerId, id));
      const [rev] = await db
        .select({
          total: sql<number>`coalesce(sum(${purchasesTable.amount}), 0)::float`,
        })
        .from(purchasesTable)
        .where(
          and(
            eq(purchasesTable.sellerId, id),
            eq(purchasesTable.paymentStatus, "completed"),
          ),
        );
      const total = Number(l?.total ?? 0);
      const sold = Number(l?.sold ?? 0);
      stats.totalListings = total;
      stats.carsSold = sold;
      stats.carsUnsold = Math.max(0, total - sold);
      stats.offersReceived = Number(o?.c ?? 0);
      stats.totalRevenue = Number(rev?.total ?? 0);
    } else if (user.role === "inspector") {
      const [i] = await db
        .select({
          total: sql<number>`count(*)::int`,
          done: sql<number>`count(*) filter (where ${inspectionsTable.status} = 'completed')::int`,
        })
        .from(inspectionsTable)
        .where(eq(inspectionsTable.inspectorId, id));
      const [rev] = await db
        .select({
          total: sql<number>`coalesce(sum(${inspectionsTable.inspectorEarnings}), 0)::float`,
        })
        .from(inspectionsTable)
        .where(
          and(
            eq(inspectionsTable.inspectorId, id),
            eq(inspectionsTable.status, "completed"),
          ),
        );
      stats.assigned = Number(i?.total ?? 0);
      stats.completed = Number(i?.done ?? 0);
      stats.totalRevenue = Number(rev?.total ?? 0);
    }

    res.json({ user, stats });
  } catch (err) {
    console.error("admin user detail error", err);
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

router.patch("/admin/users/:id/status", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const status = String(req.body?.status ?? "");
    const days = req.body?.durationDays;
    if (!Number.isFinite(id) || !["active", "inactive", "suspended"].includes(status)) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    const update: Record<string, unknown> = {
      status: status as "active" | "inactive" | "suspended",
      updatedAt: new Date(),
    };
    if (status === "suspended") {
      if (days != null && Number.isFinite(Number(days)) && Number(days) > 0) {
        const until = new Date();
        until.setDate(until.getDate() + Number(days));
        update.suspendedUntil = until;
      } else {
        update.suspendedUntil = null;
      }
    } else {
      update.suspendedUntil = null;
    }
    const updated = await db
      .update(usersTable)
      .set(update)
      .where(eq(usersTable.id, id))
      .returning({ id: usersTable.id });
    if (updated.length === 0) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    await writeAuditLog({
      userId: id,
      action: "ADMIN_USER_STATUS_UPDATED",
      resourceType: "user",
      resourceId: id,
      details: { adminId: req.user!.userId, status, durationDays: days ?? null },
      ipAddress: requestIp(req),
      userAgent: req.get("user-agent") ?? null,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("admin user status error", err);
    res.status(500).json({ error: "Failed to update status" });
  }
});

router.patch("/admin/users/:id", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const body = req.body ?? {};
    const update: Record<string, unknown> = { updatedAt: new Date() };

    if (typeof body.firstName === "string" && body.firstName.trim()) {
      update.firstName = body.firstName.trim();
    }
    if (typeof body.lastName === "string") {
      update.lastName = body.lastName.trim();
    }
    if (typeof body.email === "string" && body.email.trim()) {
      const email = body.email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        res.status(400).json({ error: "Invalid email" });
        return;
      }
      update.email = email;
    }
    if (typeof body.phone === "string" || body.phone === null) {
      update.phone = body.phone ? String(body.phone).trim() : null;
    }
    if (typeof body.status === "string") {
      const allowed = ["active", "inactive", "suspended", "pending_verification"] as const;
      if ((allowed as readonly string[]).includes(body.status)) {
        update.status = body.status;
      } else {
        res.status(400).json({ error: "Invalid status" });
        return;
      }
    }
    if (typeof body.role === "string") {
      const allowedRoles = ["buyer", "seller", "inspector", "admin"] as const;
      if ((allowedRoles as readonly string[]).includes(body.role)) {
        update.role = body.role;
      } else {
        res.status(400).json({ error: "Invalid role" });
        return;
      }
    }

    try {
      const updated = await db
        .update(usersTable)
        .set(update)
        .where(eq(usersTable.id, id))
        .returning({ id: usersTable.id, role: usersTable.role });
      if (updated.length === 0) {
        res.status(404).json({ error: "User not found" });
        return;
      }
      // Upsert seller business name when provided for a seller
      if (updated[0].role === "seller" && (typeof body.businessName === "string" || body.businessName === null)) {
        const businessName = body.businessName ? String(body.businessName).trim() : null;
        const existing = await db
          .select({ id: sellerProfilesTable.id })
          .from(sellerProfilesTable)
          .where(eq(sellerProfilesTable.userId, id))
          .limit(1);
        if (existing.length > 0) {
          await db
            .update(sellerProfilesTable)
            .set({ businessName, updatedAt: new Date() })
            .where(eq(sellerProfilesTable.userId, id));
        } else {
          await db.insert(sellerProfilesTable).values({ userId: id, businessName });
        }
      }
      // Upsert inspector profile fields when provided for an inspector
      if (updated[0].role === "inspector") {
        const inspectorPatch: Record<string, unknown> = {};
        if (typeof body.officeName === "string" || body.officeName === null) {
          inspectorPatch.officeName = body.officeName ? String(body.officeName).trim() : null;
        }
        if (typeof body.licenseNumber === "string" || body.licenseNumber === null) {
          inspectorPatch.licenseNumber = body.licenseNumber ? String(body.licenseNumber).trim() : null;
        }
        if (typeof body.serviceArea === "string" || body.serviceArea === null) {
          inspectorPatch.serviceArea = body.serviceArea ? String(body.serviceArea).trim() : null;
        }
        if (typeof body.bio === "string" || body.bio === null) {
          inspectorPatch.bio = body.bio ? String(body.bio).trim() : null;
        }
        if (typeof body.isAvailable === "boolean") {
          inspectorPatch.isAvailable = body.isAvailable;
        }
        if (typeof body.bankName === "string" || body.bankName === null) {
          inspectorPatch.bankName = body.bankName ? String(body.bankName).trim() : null;
        }
        if (typeof body.bankAccountNumber === "string" || body.bankAccountNumber === null) {
          inspectorPatch.bankAccountNumber = body.bankAccountNumber ? String(body.bankAccountNumber).trim() : null;
        }
        if (typeof body.bankAccountName === "string" || body.bankAccountName === null) {
          inspectorPatch.bankAccountName = body.bankAccountName ? String(body.bankAccountName).trim() : null;
        }
        if (Object.keys(inspectorPatch).length > 0) {
          const existing = await db
            .select({ id: inspectorProfilesTable.id })
            .from(inspectorProfilesTable)
            .where(eq(inspectorProfilesTable.userId, id))
            .limit(1);
          if (existing.length > 0) {
            await db
              .update(inspectorProfilesTable)
              .set({ ...inspectorPatch, updatedAt: new Date() })
              .where(eq(inspectorProfilesTable.userId, id));
          } else {
            await db.insert(inspectorProfilesTable).values({ userId: id, ...inspectorPatch });
          }
        }
      }
    } catch (e: unknown) {
      const msg = String((e as { message?: string })?.message ?? "");
      if (msg.includes("unique") || msg.includes("duplicate")) {
        res.status(409).json({ error: "Email already in use" });
        return;
      }
      throw e;
    }
    await writeAuditLog({
      userId: id,
      action: "ADMIN_USER_UPDATED",
      resourceType: "user",
      resourceId: id,
      details: { adminId: req.user!.userId },
      ipAddress: requestIp(req),
      userAgent: req.get("user-agent") ?? null,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("admin user update error", err);
    res.status(500).json({ error: "Failed to update user" });
  }
});

router.post("/admin/users/:id/reset-password", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const newPassword = String(req.body?.newPassword ?? "");
    const confirmPassword = String(req.body?.confirmPassword ?? "");
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid user id" });
      return;
    }
    if (!newPassword || !confirmPassword) {
      res.status(400).json({ error: "New password and confirm password are required" });
      return;
    }
    if (newPassword !== confirmPassword) {
      res.status(400).json({ error: "Passwords do not match" });
      return;
    }
    if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      res.status(400).json({
        error: "Password must be at least 8 characters and contain letters and numbers",
      });
      return;
    }

    const [target] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, id))
      .limit(1);
    if (!target) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await db
      .update(usersTable)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(usersTable.id, id));

    await writeAuditLog({
      userId: id,
      action: "ADMIN_USER_PASSWORD_RESET",
      resourceType: "user",
      resourceId: id,
      details: { adminId: req.user!.userId },
      ipAddress: requestIp(req),
      userAgent: req.get("user-agent") ?? null,
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("admin user reset password error", err);
    res.status(500).json({ error: "Failed to reset password" });
  }
});

router.delete("/admin/users/:id", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid user id" });
      return;
    }
    if (id === req.user!.userId) {
      res.status(400).json({ error: "You cannot delete your own admin account" });
      return;
    }

    const [existing] = await db
      .select({
        id: usersTable.id,
        role: usersTable.role,
        email: usersTable.email,
      })
      .from(usersTable)
      .where(eq(usersTable.id, id))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    await db.delete(usersTable).where(eq(usersTable.id, id));

    // Record the action against the acting admin user to avoid FK/logging
    // failures after the deleted user row is gone.
    void writeAuditLog({
      userId: req.user!.userId,
      action: "ADMIN_USER_DELETED",
      resourceType: "user",
      resourceId: id,
      details: { adminId: req.user!.userId, deletedUserId: id, email: existing.email, role: existing.role },
      ipAddress: requestIp(req),
      userAgent: req.get("user-agent") ?? null,
    }).catch(() => {});

    res.json({ ok: true });
  } catch (err) {
    console.error("admin user delete error", err);
    res.status(500).json({ error: "Failed to delete user" });
  }
});

router.get("/admin/users/:id/audit-log", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const search = String(req.query.search ?? "").trim().toLowerCase();
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(String(req.query.pageSize ?? "10"), 10) || 10),
    );
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid user id" });
      return;
    }

    const baseWhere = eq(auditLogsTable.userId, id);
    const where = search
      ? and(
          baseWhere,
          or(
            ilike(auditLogsTable.action, `%${search}%`),
            ilike(auditLogsTable.ipAddress, `%${search}%`),
            sql`CAST(${auditLogsTable.details} AS text) ILIKE ${`%${search}%`}`,
          )!,
        )
      : baseWhere;
    const rows = await db
      .select({
        id: auditLogsTable.id,
        action: auditLogsTable.action,
        details: auditLogsTable.details,
        ipAddress: auditLogsTable.ipAddress,
        createdAt: auditLogsTable.createdAt,
      })
      .from(auditLogsTable)
      .where(where)
      .orderBy(desc(auditLogsTable.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const [{ c: total }] = await db
      .select({ c: count() })
      .from(auditLogsTable)
      .where(where);

    res.json({
      items: rows,
      total: Number(total),
      page,
      pageSize,
    });
  } catch (err) {
    console.error("admin user audit log error", err);
    res.status(500).json({ error: "Failed to fetch user audit log" });
  }
});

router.post("/admin/users/:id/message", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const adminId = req.user!.userId;
    const targetId = parseInt(String(req.params.id), 10);
    const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
    const subject = typeof req.body?.subject === "string" ? req.body.subject.trim() : "";

    if (!Number.isFinite(targetId) || targetId === adminId) {
      res.status(400).json({ error: "Invalid recipient" });
      return;
    }
    if (!content) {
      res.status(400).json({ error: "Message is required" });
      return;
    }
    if (content.length > 4000) {
      res.status(400).json({ error: "Message is too long (max 4000 characters)" });
      return;
    }
    if (subject.length > 200) {
      res.status(400).json({ error: "Subject is too long (max 200 characters)" });
      return;
    }

    const [recipient] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, targetId))
      .limit(1);
    if (!recipient) {
      res.status(404).json({ error: "Recipient not found" });
      return;
    }

    const lockA = Math.min(adminId, targetId);
    const lockB = Math.max(adminId, targetId);

    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${lockA}, ${lockB})`);

      const myConvs = await tx
        .select({ conversationId: conversationParticipantsTable.conversationId })
        .from(conversationParticipantsTable)
        .where(eq(conversationParticipantsTable.userId, adminId));
      const myIds = myConvs.map((r) => r.conversationId);

      let convId: number | null = null;
      if (myIds.length > 0) {
        const shared = await tx
          .select({ conversationId: conversationParticipantsTable.conversationId })
          .from(conversationParticipantsTable)
          .innerJoin(
            conversationsTable,
            eq(conversationsTable.id, conversationParticipantsTable.conversationId),
          )
          .where(
            and(
              inArray(conversationParticipantsTable.conversationId, myIds),
              eq(conversationParticipantsTable.userId, targetId),
              eq(conversationsTable.type, "direct"),
              sql`${conversationsTable.listingId} is null`,
            ),
          )
          .limit(1);
        if (shared[0]) convId = shared[0].conversationId;
      }

      if (!convId) {
        const [created] = await tx
          .insert(conversationsTable)
          .values({ type: "direct", listingId: null, subject: subject || null })
          .returning();
        convId = created.id;
        await tx.insert(conversationParticipantsTable).values([
          { conversationId: convId, userId: adminId },
          { conversationId: convId, userId: targetId },
        ]);
      } else if (subject) {
        await tx
          .update(conversationsTable)
          .set({ subject, updatedAt: new Date() })
          .where(eq(conversationsTable.id, convId));
      }

      const [m] = await tx
        .insert(messagesTable)
        .values({ conversationId: convId, senderId: adminId, content, isRead: false })
        .returning();

      await tx
        .update(conversationsTable)
        .set({ updatedAt: new Date() })
        .where(eq(conversationsTable.id, convId));

      return { conversationId: convId, messageId: m.id };
    });

    res.status(201).json(result);
  } catch (err) {
    console.error("admin user message error", err);
    res.status(500).json({ error: "Failed to send message" });
  }
});

router.get("/admin/users/:id/offers", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const search = String(req.query.search ?? "").trim();
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize ?? "10"), 10) || 10));
    const role = String(req.query.role ?? "buyer");
    const userCol = role === "seller" ? offersTable.sellerId : offersTable.buyerId;

    const conds = [eq(userCol, id)];
    if (search) {
      conds.push(
        or(
          ilike(listingsTable.make, `%${search}%`),
          ilike(listingsTable.model, `%${search}%`),
          ilike(usersTable.firstName, `%${search}%`),
          ilike(usersTable.lastName, `%${search}%`),
        )!,
      );
    }
    const where = conds.length > 1 ? and(...conds) : conds[0];

    const counterpartyCol = role === "seller" ? offersTable.buyerId : offersTable.sellerId;

    const rows = await db
      .select({
        id: offersTable.id,
        listingId: offersTable.listingId,
        buyerId: offersTable.buyerId,
        amount: offersTable.amount,
        status: offersTable.status,
        createdAt: offersTable.createdAt,
        listingMake: listingsTable.make,
        listingModel: listingsTable.model,
        listingYear: listingsTable.year,
        counterpartyFirst: usersTable.firstName,
        counterpartyLast: usersTable.lastName,
      })
      .from(offersTable)
      .leftJoin(listingsTable, eq(listingsTable.id, offersTable.listingId))
      .leftJoin(usersTable, eq(usersTable.id, counterpartyCol))
      .where(where)
      .orderBy(desc(offersTable.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const [{ c: total }] = await db
      .select({ c: count() })
      .from(offersTable)
      .leftJoin(listingsTable, eq(listingsTable.id, offersTable.listingId))
      .leftJoin(usersTable, eq(usersTable.id, counterpartyCol))
      .where(where);

    // Enrich with inspection status + pass % per (listingId, buyerId)
    const enriched = await Promise.all(
      rows.map(async (r) => {
        const [insp] = await db
          .select({
            status: inspectionsTable.status,
            body: inspectionReportsTable.bodyCondition,
            engine: inspectionReportsTable.engineCondition,
            interior: inspectionReportsTable.interiorCondition,
            electrical: inspectionReportsTable.electricalCondition,
            suspension: inspectionReportsTable.suspensionCondition,
            tyre: inspectionReportsTable.tyreCondition,
          })
          .from(inspectionsTable)
          .leftJoin(
            inspectionReportsTable,
            eq(inspectionReportsTable.inspectionId, inspectionsTable.id),
          )
          .where(
            and(
              eq(inspectionsTable.listingId, r.listingId),
              eq(inspectionsTable.buyerId, r.buyerId),
            ),
          )
          .orderBy(desc(inspectionsTable.createdAt))
          .limit(1);

        let inspectionStatus: string | null = null;
        let passedPct: number | null = null;
        if (insp) {
          inspectionStatus = insp.status;
          const conds = [
            insp.body,
            insp.engine,
            insp.interior,
            insp.electrical,
            insp.suspension,
            insp.tyre,
          ];
          const filled = conds.filter((c) => !!c);
          if (filled.length > 0) {
            const passed = filled.filter(
              (c) => c === "excellent" || c === "good",
            ).length;
            passedPct = Math.round((passed / filled.length) * 100);
          }
        }
        return { ...r, inspectionStatus, passedPct };
      }),
    );

    let withOfferCount = enriched;
    if (role === "seller") {
      const listingIds = Array.from(
        new Set(enriched.map((r) => r.listingId).filter((x): x is number => x != null)),
      );
      const counts = listingIds.length
        ? await db
            .select({
              listingId: offersTable.listingId,
              c: sql<number>`count(*)::int`,
            })
            .from(offersTable)
            .where(inArray(offersTable.listingId, listingIds))
            .groupBy(offersTable.listingId)
        : [];
      const cMap = new Map(counts.map((c) => [c.listingId, Number(c.c) || 0]));
      withOfferCount = enriched.map((r) => ({
        ...r,
        offerCount: cMap.get(r.listingId) ?? 0,
      }));
    }

    res.json({ items: withOfferCount, total: Number(total), page, pageSize });
  } catch (err) {
    console.error("admin user offers error", err);
    res.status(500).json({ error: "Failed to fetch offers" });
  }
});

router.get("/admin/users/:id/purchases", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const search = String(req.query.search ?? "").trim();
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize ?? "10"), 10) || 10));
    const role = String(req.query.role ?? "buyer");
    const userCol = role === "seller" ? purchasesTable.sellerId : purchasesTable.buyerId;
    const counterpartyCol = role === "seller" ? purchasesTable.buyerId : purchasesTable.sellerId;

    const conds = [eq(userCol, id)];
    if (search) {
      conds.push(
        or(
          ilike(listingsTable.make, `%${search}%`),
          ilike(listingsTable.model, `%${search}%`),
          ilike(usersTable.firstName, `%${search}%`),
          ilike(usersTable.lastName, `%${search}%`),
        )!,
      );
    }
    const where = conds.length > 1 ? and(...conds) : conds[0];

    const rows = await db
      .select({
        id: purchasesTable.id,
        amount: purchasesTable.amount,
        paymentStatus: purchasesTable.paymentStatus,
        receiptNumber: purchasesTable.receiptNumber,
        createdAt: purchasesTable.createdAt,
        listingMake: listingsTable.make,
        listingModel: listingsTable.model,
        listingYear: listingsTable.year,
        counterpartyFirst: usersTable.firstName,
        counterpartyLast: usersTable.lastName,
      })
      .from(purchasesTable)
      .leftJoin(listingsTable, eq(listingsTable.id, purchasesTable.listingId))
      .leftJoin(usersTable, eq(usersTable.id, counterpartyCol))
      .where(where)
      .orderBy(desc(purchasesTable.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const [{ c: total }] = await db
      .select({ c: count() })
      .from(purchasesTable)
      .leftJoin(listingsTable, eq(listingsTable.id, purchasesTable.listingId))
      .leftJoin(usersTable, eq(usersTable.id, counterpartyCol))
      .where(where);

    res.json({ items: rows, total: Number(total), page, pageSize });
  } catch (err) {
    console.error("admin user purchases error", err);
    res.status(500).json({ error: "Failed to fetch purchases" });
  }
});

router.get("/admin/users/:id/inspections", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const search = String(req.query.search ?? "").trim();
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize ?? "10"), 10) || 10));
    const role = String(req.query.role ?? "buyer");
    const userCol =
      role === "inspector" ? inspectionsTable.inspectorId : inspectionsTable.buyerId;

    const sellerUsers = alias(usersTable, "seller_users");
    const buyerUsers = alias(usersTable, "buyer_users");

    const conds = [eq(userCol, id)];
    if (search) {
      conds.push(
        or(
          ilike(listingsTable.make, `%${search}%`),
          ilike(listingsTable.model, `%${search}%`),
          ilike(sellerUsers.firstName, `%${search}%`),
          ilike(sellerUsers.lastName, `%${search}%`),
          ilike(buyerUsers.firstName, `%${search}%`),
          ilike(buyerUsers.lastName, `%${search}%`),
        )!,
      );
    }
    const where = conds.length > 1 ? and(...conds) : conds[0];

    const rows = await db
      .select({
        id: inspectionsTable.id,
        status: inspectionsTable.status,
        scheduledAt: inspectionsTable.scheduledAt,
        completedAt: inspectionsTable.completedAt,
        paidAt: inspectionsTable.paidAt,
        fee: inspectionsTable.fee,
        inspectorEarnings: inspectionsTable.inspectorEarnings,
        createdAt: inspectionsTable.createdAt,
        listingMake: listingsTable.make,
        listingModel: listingsTable.model,
        listingYear: listingsTable.year,
        sellerFirst: sellerUsers.firstName,
        sellerLast: sellerUsers.lastName,
        buyerFirst: buyerUsers.firstName,
        buyerLast: buyerUsers.lastName,
        body: inspectionReportsTable.bodyCondition,
        engine: inspectionReportsTable.engineCondition,
        interior: inspectionReportsTable.interiorCondition,
        electrical: inspectionReportsTable.electricalCondition,
        suspension: inspectionReportsTable.suspensionCondition,
        tyre: inspectionReportsTable.tyreCondition,
      })
      .from(inspectionsTable)
      .leftJoin(listingsTable, eq(listingsTable.id, inspectionsTable.listingId))
      .leftJoin(sellerUsers, eq(sellerUsers.id, listingsTable.sellerId))
      .leftJoin(buyerUsers, eq(buyerUsers.id, inspectionsTable.buyerId))
      .leftJoin(
        inspectionReportsTable,
        eq(inspectionReportsTable.inspectionId, inspectionsTable.id),
      )
      .where(where)
      .orderBy(desc(inspectionsTable.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const [{ c: total }] = await db
      .select({ c: count() })
      .from(inspectionsTable)
      .leftJoin(listingsTable, eq(listingsTable.id, inspectionsTable.listingId))
      .leftJoin(sellerUsers, eq(sellerUsers.id, listingsTable.sellerId))
      .leftJoin(buyerUsers, eq(buyerUsers.id, inspectionsTable.buyerId))
      .where(where);

    const items = rows.map((r) => {
      const conds = [r.body, r.engine, r.interior, r.electrical, r.suspension, r.tyre];
      const filled = conds.filter((c) => !!c);
      let passedPct: number | null = null;
      if (filled.length > 0) {
        const passed = filled.filter((c) => c === "excellent" || c === "good").length;
        passedPct = Math.round((passed / filled.length) * 100);
      }
      // For inspector view, primary counterparty is the buyer; for buyer view, the seller.
      const counterpartyFirst = role === "inspector" ? r.buyerFirst : r.sellerFirst;
      const counterpartyLast = role === "inspector" ? r.buyerLast : r.sellerLast;
      return {
        id: r.id,
        status: r.status,
        scheduledAt: r.scheduledAt,
        completedAt: r.completedAt,
        paidAt: r.paidAt,
        fee: r.fee,
        inspectorEarnings: r.inspectorEarnings,
        createdAt: r.createdAt,
        listingMake: r.listingMake,
        listingModel: r.listingModel,
        listingYear: r.listingYear,
        sellerFirst: r.sellerFirst,
        sellerLast: r.sellerLast,
        buyerFirst: r.buyerFirst,
        buyerLast: r.buyerLast,
        counterpartyFirst,
        counterpartyLast,
        passedPct,
      };
    });

    res.json({ items, total: Number(total), page, pageSize });
  } catch (err) {
    console.error("admin user inspections error", err);
    res.status(500).json({ error: "Failed to fetch inspections" });
  }
});

router.get("/admin/users/:id/tickets", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const search = String(req.query.search ?? "").trim();
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize ?? "10"), 10) || 10));

    const conds = [eq(supportTicketsTable.userId, id)];
    if (search) {
      conds.push(ilike(supportTicketsTable.subject, `%${search}%`));
    }
    const where = conds.length > 1 ? and(...conds) : conds[0];

    const rows = await db
      .select({
        id: supportTicketsTable.id,
        subject: supportTicketsTable.subject,
        category: supportTicketsTable.category,
        status: supportTicketsTable.status,
        priority: supportTicketsTable.priority,
        createdAt: supportTicketsTable.createdAt,
        assignedFirstName: usersTable.firstName,
        assignedLastName: usersTable.lastName,
        lastResponseAt: sql<Date | null>`(
          select max(${supportTicketMessagesTable.createdAt})
          from ${supportTicketMessagesTable}
          where ${supportTicketMessagesTable.ticketId} = ${supportTicketsTable.id}
        )`,
      })
      .from(supportTicketsTable)
      .leftJoin(usersTable, eq(usersTable.id, supportTicketsTable.assignedTo))
      .where(where)
      .orderBy(desc(supportTicketsTable.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const [{ c: total }] = await db
      .select({ c: count() })
      .from(supportTicketsTable)
      .where(where);

    res.json({ items: rows, total: Number(total), page, pageSize });
  } catch (err) {
    console.error("admin user tickets error", err);
    res.status(500).json({ error: "Failed to fetch tickets" });
  }
});

router.get("/admin/users/:id/listings", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const search = String(req.query.search ?? "").trim();
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize ?? "10"), 10) || 10));

    const conds = [eq(listingsTable.sellerId, id)];
    if (search) {
      conds.push(
        or(
          ilike(listingsTable.make, `%${search}%`),
          ilike(listingsTable.model, `%${search}%`),
          ilike(listingsTable.title, `%${search}%`),
        )!,
      );
    }
    const where = conds.length > 1 ? and(...conds) : conds[0];

    const rows = await db
      .select({
        id: listingsTable.id,
        make: listingsTable.make,
        model: listingsTable.model,
        year: listingsTable.year,
        price: listingsTable.price,
        status: listingsTable.status,
        viewCount: listingsTable.viewCount,
        createdAt: listingsTable.createdAt,
      })
      .from(listingsTable)
      .where(where)
      .orderBy(desc(listingsTable.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const [{ c: total }] = await db
      .select({ c: count() })
      .from(listingsTable)
      .where(where);

    res.json({ items: rows, total: Number(total), page, pageSize });
  } catch (err) {
    console.error("admin user listings error", err);
    res.status(500).json({ error: "Failed to fetch listings" });
  }
});

router.get("/admin/users/:id/feedback", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const search = String(req.query.search ?? "").trim();
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize ?? "10"), 10) || 10));
    const groupBy = String(req.query.groupBy ?? "");

    const conds = [eq(reviewsTable.sellerId, id)];
    if (search) {
      conds.push(
        or(
          ilike(usersTable.firstName, `%${search}%`),
          ilike(usersTable.lastName, `%${search}%`),
          ilike(reviewsTable.comment, `%${search}%`),
          ilike(listingsTable.make, `%${search}%`),
          ilike(listingsTable.model, `%${search}%`),
        )!,
      );
    }
    const where = conds.length > 1 ? and(...conds) : conds[0];

    if (groupBy === "day") {
      // Group reviews by day, paginate over distinct days
      const dayKeyExpr = sql<string>`to_char(${reviewsTable.createdAt}, 'YYYY-MM-DD')`;
      const days = await db
        .selectDistinct({ dayKey: dayKeyExpr })
        .from(reviewsTable)
        .leftJoin(listingsTable, eq(listingsTable.id, reviewsTable.listingId))
        .leftJoin(usersTable, eq(usersTable.id, reviewsTable.buyerId))
        .where(where)
        .orderBy(desc(dayKeyExpr))
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      const [{ c: totalDays }] = await db
        .select({ c: sql<number>`count(distinct to_char(${reviewsTable.createdAt}, 'YYYY-MM-DD'))` })
        .from(reviewsTable)
        .leftJoin(listingsTable, eq(listingsTable.id, reviewsTable.listingId))
        .leftJoin(usersTable, eq(usersTable.id, reviewsTable.buyerId))
        .where(where);

      const dayKeys = days.map((d) => d.dayKey);
      let items: Array<{ dayKey: string; createdAt: string; reviews: unknown[] }> = [];
      if (dayKeys.length > 0) {
        const reviews = await db
          .select({
            id: reviewsTable.id,
            rating: reviewsTable.rating,
            comment: reviewsTable.comment,
            createdAt: reviewsTable.createdAt,
            sellerResponse: reviewsTable.sellerResponse,
            listingMake: listingsTable.make,
            listingModel: listingsTable.model,
            listingYear: listingsTable.year,
            counterpartyFirst: usersTable.firstName,
            counterpartyLast: usersTable.lastName,
            dayKey: dayKeyExpr,
          })
          .from(reviewsTable)
          .leftJoin(listingsTable, eq(listingsTable.id, reviewsTable.listingId))
          .leftJoin(usersTable, eq(usersTable.id, reviewsTable.buyerId))
          .where(and(where, inArray(dayKeyExpr, dayKeys))!)
          .orderBy(desc(reviewsTable.createdAt));

        const byDay = new Map<string, { dayKey: string; createdAt: string; reviews: unknown[] }>();
        for (const dk of dayKeys) byDay.set(dk, { dayKey: dk, createdAt: "", reviews: [] });
        for (const r of reviews) {
          const g = byDay.get(r.dayKey);
          if (!g) continue;
          if (!g.createdAt) g.createdAt = r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt);
          const { dayKey: _omit, ...rest } = r;
          g.reviews.push({ ...rest, status: r.sellerResponse ? "responded" : "pending" });
        }
        items = dayKeys.map((dk) => byDay.get(dk)!).filter(Boolean);
      }
      res.json({ items, total: Number(totalDays), page, pageSize });
      return;
    }

    const rows = await db
      .select({
        id: reviewsTable.id,
        rating: reviewsTable.rating,
        comment: reviewsTable.comment,
        createdAt: reviewsTable.createdAt,
        sellerResponse: reviewsTable.sellerResponse,
        listingMake: listingsTable.make,
        listingModel: listingsTable.model,
        listingYear: listingsTable.year,
        counterpartyFirst: usersTable.firstName,
        counterpartyLast: usersTable.lastName,
      })
      .from(reviewsTable)
      .leftJoin(listingsTable, eq(listingsTable.id, reviewsTable.listingId))
      .leftJoin(usersTable, eq(usersTable.id, reviewsTable.buyerId))
      .where(where)
      .orderBy(desc(reviewsTable.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const [{ c: total }] = await db
      .select({ c: count() })
      .from(reviewsTable)
      .leftJoin(listingsTable, eq(listingsTable.id, reviewsTable.listingId))
      .leftJoin(usersTable, eq(usersTable.id, reviewsTable.buyerId))
      .where(where);

    const items = rows.map((r) => ({
      ...r,
      status: r.sellerResponse ? "responded" : "pending",
    }));

    res.json({ items, total: Number(total), page, pageSize });
  } catch (err) {
    console.error("admin user feedback error", err);
    res.status(500).json({ error: "Failed to fetch feedback" });
  }
});

router.get("/admin/users/:id/seller-profile", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [profile] = await db
      .select({
        businessName: sellerProfilesTable.businessName,
        ninNumber: sellerProfilesTable.ninNumber,
        ninDocumentUrl: sellerProfilesTable.ninDocumentUrl,
        proofOfAddressUrl: sellerProfilesTable.proofOfAddressUrl,
        verificationStatus: sellerProfilesTable.verificationStatus,
        isVerified: sellerProfilesTable.isVerified,
        bankName: sellerProfilesTable.bankName,
        bankAccountNumber: sellerProfilesTable.bankAccountNumber,
        bankAccountName: sellerProfilesTable.bankAccountName,
        location: sellerProfilesTable.location,
      })
      .from(sellerProfilesTable)
      .where(eq(sellerProfilesTable.userId, id));
    res.json(profile ?? null);
  } catch (err) {
    console.error("admin seller profile error", err);
    res.status(500).json({ error: "Failed to fetch seller profile" });
  }
});

router.get("/admin/inspections/:id/receipt", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const sellerUsers = alias(usersTable, "seller_users_r");
    const buyerUsers = alias(usersTable, "buyer_users_r");
    const inspectorUsers = alias(usersTable, "inspector_users_r");
    const [row] = await db
      .select({
        id: inspectionsTable.id,
        status: inspectionsTable.status,
        scheduledAt: inspectionsTable.scheduledAt,
        completedAt: inspectionsTable.completedAt,
        paidAt: inspectionsTable.paidAt,
        fee: inspectionsTable.fee,
        inspectorEarnings: inspectionsTable.inspectorEarnings,
        platformFee: inspectionsTable.platformFee,
        createdAt: inspectionsTable.createdAt,
        listingMake: listingsTable.make,
        listingModel: listingsTable.model,
        listingYear: listingsTable.year,
        sellerFirst: sellerUsers.firstName,
        sellerLast: sellerUsers.lastName,
        buyerFirst: buyerUsers.firstName,
        buyerLast: buyerUsers.lastName,
        inspectorFirst: inspectorUsers.firstName,
        inspectorLast: inspectorUsers.lastName,
      })
      .from(inspectionsTable)
      .leftJoin(listingsTable, eq(listingsTable.id, inspectionsTable.listingId))
      .leftJoin(sellerUsers, eq(sellerUsers.id, listingsTable.sellerId))
      .leftJoin(buyerUsers, eq(buyerUsers.id, inspectionsTable.buyerId))
      .leftJoin(inspectorUsers, eq(inspectorUsers.id, inspectionsTable.inspectorId))
      .where(eq(inspectionsTable.id, id));
    if (!row) {
      res.status(404).json({ error: "Inspection not found" });
      return;
    }
    const fmt = (n: number) => `NGN ${Number(n || 0).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const lines = [
      "HUCE AUTOS — Inspection Transaction Receipt",
      "===========================================",
      `Receipt ID:        INS-${row.id}`,
      `Status:            ${row.status}`,
      `Description:       Inspection Fee`,
      `Vehicle:           ${row.listingMake ?? "-"} ${row.listingModel ?? ""} ${row.listingYear ?? ""}`.trim(),
      `Seller:            ${`${row.sellerFirst ?? ""} ${row.sellerLast ?? ""}`.trim() || "-"}`,
      `Buyer:             ${`${row.buyerFirst ?? ""} ${row.buyerLast ?? ""}`.trim() || "-"}`,
      `Inspector:         ${`${row.inspectorFirst ?? ""} ${row.inspectorLast ?? ""}`.trim() || "-"}`,
      `Scheduled:         ${row.scheduledAt ? new Date(row.scheduledAt).toLocaleString() : "-"}`,
      `Completed:         ${row.completedAt ? new Date(row.completedAt).toLocaleString() : "-"}`,
      `Paid At:           ${row.paidAt ? new Date(row.paidAt).toLocaleString() : "-"}`,
      "",
      `Total Fee:         ${fmt(Number(row.fee ?? 0))}`,
      `Platform Fee:      ${fmt(Number(row.platformFee ?? 0))}`,
      `Inspector Earned:  ${fmt(Number(row.inspectorEarnings ?? 0))}`,
      "",
      `Generated:         ${new Date().toLocaleString()}`,
      "",
    ];
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="inspection-${row.id}-receipt.txt"`);
    res.send(lines.join("\n"));
  } catch (err) {
    console.error("admin inspection receipt error", err);
    res.status(500).json({ error: "Failed to generate receipt" });
  }
});

router.get("/admin/users/:id/transactions/export", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const role = String(req.query.role ?? "");
    if (role !== "inspector") {
      res.status(400).json({ error: "Unsupported role for export" });
      return;
    }
    const sellerUsers = alias(usersTable, "seller_users_x");
    const buyerUsers = alias(usersTable, "buyer_users_x");
    const rows = await db
      .select({
        id: inspectionsTable.id,
        status: inspectionsTable.status,
        paidAt: inspectionsTable.paidAt,
        createdAt: inspectionsTable.createdAt,
        inspectorEarnings: inspectionsTable.inspectorEarnings,
        listingMake: listingsTable.make,
        listingModel: listingsTable.model,
        listingYear: listingsTable.year,
        sellerFirst: sellerUsers.firstName,
        sellerLast: sellerUsers.lastName,
        buyerFirst: buyerUsers.firstName,
        buyerLast: buyerUsers.lastName,
      })
      .from(inspectionsTable)
      .leftJoin(listingsTable, eq(listingsTable.id, inspectionsTable.listingId))
      .leftJoin(sellerUsers, eq(sellerUsers.id, listingsTable.sellerId))
      .leftJoin(buyerUsers, eq(buyerUsers.id, inspectionsTable.buyerId))
      .where(eq(inspectionsTable.inspectorId, id))
      .orderBy(desc(inspectionsTable.createdAt));

    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = [
      "TXN ID",
      "Description",
      "Vehicle",
      "Seller Name",
      "Name",
      "Amount (NGN)",
      "Transaction Date",
      "Status",
    ];
    const body = rows.map((r) => {
      const isPaid = !!r.paidAt && r.status === "completed";
      const status = isPaid ? "Paid" : "In-Escrow";
      const date = (r.paidAt ?? r.createdAt) ? new Date((r.paidAt ?? r.createdAt) as Date).toISOString() : "";
      const vehicle = `${r.listingMake ?? ""} ${r.listingModel ?? ""} ${r.listingYear ?? ""}`.trim();
      const seller = `${r.sellerFirst ?? ""} ${r.sellerLast ?? ""}`.trim();
      const buyer = `${r.buyerFirst ?? ""} ${r.buyerLast ?? ""}`.trim();
      return [
        `INS-${r.id}`,
        "Inspection Fee",
        vehicle,
        seller,
        buyer,
        Number(r.inspectorEarnings ?? 0).toFixed(2),
        date,
        status,
      ].map(esc).join(",");
    });
    const csv = [header.join(","), ...body].join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="inspector-${id}-transactions.csv"`);
    res.send(csv);
  } catch (err) {
    console.error("admin inspector transactions export error", err);
    res.status(500).json({ error: "Failed to export transactions" });
  }
});

router.get("/admin/users/:id/inspector-profile", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [profile] = await db
      .select({
        officeName: inspectorProfilesTable.officeName,
        licenseNumber: inspectorProfilesTable.licenseNumber,
        serviceArea: inspectorProfilesTable.serviceArea,
        bio: inspectorProfilesTable.bio,
        bankName: inspectorProfilesTable.bankName,
        bankAccountNumber: inspectorProfilesTable.bankAccountNumber,
        bankAccountName: inspectorProfilesTable.bankAccountName,
        rating: inspectorProfilesTable.rating,
        totalInspections: inspectorProfilesTable.totalInspections,
        isAvailable: inspectorProfilesTable.isAvailable,
      })
      .from(inspectorProfilesTable)
      .where(eq(inspectorProfilesTable.userId, id));
    res.json(profile ?? null);
  } catch (err) {
    console.error("admin inspector profile error", err);
    res.status(500).json({ error: "Failed to fetch inspector profile" });
  }
});

router.get("/admin/recent/transactions", requireAdmin, async (_req: AuthRequest, res) => {
  try {
    const rows = await db
      .select({
        id: purchasesTable.id,
        amount: purchasesTable.amount,
        status: purchasesTable.paymentStatus,
        createdAt: purchasesTable.createdAt,
        buyerFirstName: usersTable.firstName,
        buyerLastName: usersTable.lastName,
      })
      .from(purchasesTable)
      .leftJoin(usersTable, eq(usersTable.id, purchasesTable.buyerId))
      .orderBy(desc(purchasesTable.createdAt))
      .limit(8);
    res.json(rows);
  } catch (err) {
    console.error("admin recent transactions error", err);
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
});

// ─── Listings inventory ──────────────────────────────────────────────────────

router.get("/admin/listings", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
    const pageSize = Math.min(50, Math.max(1, parseInt(String(req.query.pageSize ?? "20"), 10)));
    const status = String(req.query.status ?? "");
    const search = String(req.query.search ?? "").trim();

    const allowedStatuses = ["active", "sold", "pending", "deleted", "suspended"];
    const statusFilter = allowedStatuses.includes(status) ? status : null;

    const sellerUsers = alias(usersTable, "seller_users_inv");

    const conditions = [];
    if (statusFilter) {
      conditions.push(sql`${listingsTable.status} = ${statusFilter}`);
    } else {
      conditions.push(sql`${listingsTable.status} != 'deleted'`);
    }
    if (search) {
      conditions.push(
        or(
          ilike(listingsTable.make, `%${search}%`),
          ilike(listingsTable.model, `%${search}%`),
          ilike(sellerUsers.firstName, `%${search}%`),
          ilike(sellerUsers.lastName, `%${search}%`),
        ),
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [countRow] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(listingsTable)
      .leftJoin(sellerUsers, eq(sellerUsers.id, listingsTable.sellerId))
      .where(where);

    const rows = await db
      .select({
        id: listingsTable.id,
        make: listingsTable.make,
        model: listingsTable.model,
        year: listingsTable.year,
        price: listingsTable.price,
        status: listingsTable.status,
        viewCount: listingsTable.viewCount,
        createdAt: listingsTable.createdAt,
        sellerFirstName: sellerUsers.firstName,
        sellerLastName: sellerUsers.lastName,
        sellerBusinessName: sellerProfilesTable.businessName,
      })
      .from(listingsTable)
      .leftJoin(sellerUsers, eq(sellerUsers.id, listingsTable.sellerId))
      .leftJoin(sellerProfilesTable, eq(sellerProfilesTable.userId, listingsTable.sellerId))
      .where(where)
      .orderBy(desc(listingsTable.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    res.json({ items: rows, total: countRow?.total ?? 0, page, pageSize });
  } catch (err) {
    console.error("admin listings error", err);
    res.status(500).json({ error: "Failed to fetch listings" });
  }
});

// ─── Delete Listing Requests ─────────────────────────────────────────────────
// Must be defined BEFORE /admin/listings/:id so Express doesn't swallow
// "delete-requests" as a numeric :id parameter.

router.get("/admin/listings/delete-requests", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
    const pageSize = Math.min(50, Math.max(1, parseInt(String(req.query.pageSize ?? "20"), 10)));
    const search = String(req.query.search ?? "").trim();
    const status = String(req.query.status ?? "pending");

    const sellerUsers = alias(usersTable, "seller_users_dr");
    const conditions: SQL[] = [];

    if (status === "pending" || status === "approved" || status === "rejected") {
      conditions.push(eq(listingDeletionRequestsTable.status, status as "pending" | "approved" | "rejected"));
    }
    if (search) {
      conditions.push(
        or(
          ilike(listingsTable.make, `%${search}%`),
          ilike(listingsTable.model, `%${search}%`),
          ilike(sellerUsers.firstName, `%${search}%`),
          ilike(sellerUsers.lastName, `%${search}%`),
        )!,
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [countRow] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(listingDeletionRequestsTable)
      .leftJoin(listingsTable, eq(listingsTable.id, listingDeletionRequestsTable.listingId))
      .leftJoin(sellerUsers, eq(sellerUsers.id, listingDeletionRequestsTable.sellerId))
      .where(where);

    const rows = await db
      .select({
        id: listingDeletionRequestsTable.id,
        status: listingDeletionRequestsTable.status,
        reason: listingDeletionRequestsTable.reason,
        createdAt: listingDeletionRequestsTable.createdAt,
        listingId: listingsTable.id,
        listingMake: listingsTable.make,
        listingModel: listingsTable.model,
        listingYear: listingsTable.year,
        listingPrice: listingsTable.price,
        listingStatus: listingsTable.status,
        listingViewCount: listingsTable.viewCount,
        listingCreatedAt: listingsTable.createdAt,
        sellerFirstName: sellerUsers.firstName,
        sellerLastName: sellerUsers.lastName,
        sellerBusinessName: sellerProfilesTable.businessName,
      })
      .from(listingDeletionRequestsTable)
      .leftJoin(listingsTable, eq(listingsTable.id, listingDeletionRequestsTable.listingId))
      .leftJoin(sellerUsers, eq(sellerUsers.id, listingDeletionRequestsTable.sellerId))
      .leftJoin(sellerProfilesTable, eq(sellerProfilesTable.userId, listingDeletionRequestsTable.sellerId))
      .where(where)
      .orderBy(desc(listingDeletionRequestsTable.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    res.json({ items: rows, total: countRow?.total ?? 0, page, pageSize });
  } catch (err) {
    console.error("admin delete-requests error", err);
    res.status(500).json({ error: "Failed to fetch deletion requests" });
  }
});

router.patch("/admin/listings/delete-requests/:id", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const { action } = req.body as { action?: string };
    if (action !== "approve" && action !== "reject") {
      res.status(400).json({ error: "action must be approve or reject" });
      return;
    }

    const newStatus = action === "approve" ? "approved" : "rejected";
    const adminId = req.user!.userId;

    const [updated] = await db
      .update(listingDeletionRequestsTable)
      .set({
        status: newStatus,
        decidedBy: adminId,
        decidedAt: new Date(),
      })
      .where(eq(listingDeletionRequestsTable.id, id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Request not found" });
      return;
    }

    if (action === "approve") {
      await db
        .update(listingsTable)
        .set({ status: "deleted" })
        .where(eq(listingsTable.id, updated.listingId));
    }

    res.json({ success: true, id: updated.id, status: newStatus });
  } catch (err) {
    console.error("admin delete-request patch error", err);
    res.status(500).json({ error: "Failed to update deletion request" });
  }
});

// ─── Admin listing detail ─────────────────────────────────────────────────────

router.get("/admin/listings/:id", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const [row] = await db.select().from(listingsTable).where(eq(listingsTable.id, id)).limit(1);
    if (!row) { res.status(404).json({ error: "Listing not found" }); return; }

    const [images, featureLinks, sellerRows, pendingDel] = await Promise.all([
      db.select().from(listingImagesTable)
        .where(eq(listingImagesTable.listingId, id))
        .orderBy(listingImagesTable.displayOrder),
      db.select({
        id: carFeaturesTable.id,
        name: carFeaturesTable.name,
        featureGroup: carFeaturesTable.featureGroup,
      })
        .from(listingFeatureLinksTable)
        .innerJoin(carFeaturesTable, eq(carFeaturesTable.id, listingFeatureLinksTable.featureId))
        .where(eq(listingFeatureLinksTable.listingId, id)),
      db.select({
        id: usersTable.id,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        businessName: sellerProfilesTable.businessName,
        email: usersTable.email,
      })
        .from(usersTable)
        .leftJoin(sellerProfilesTable, eq(sellerProfilesTable.userId, usersTable.id))
        .where(eq(usersTable.id, row.sellerId))
        .limit(1),
      db.select({ id: listingDeletionRequestsTable.id })
        .from(listingDeletionRequestsTable)
        .where(and(
          eq(listingDeletionRequestsTable.listingId, id),
          eq(listingDeletionRequestsTable.status, "pending"),
        ))
        .limit(1),
    ]);

    const normalizedImages = images
      .map((img) => ({
      ...img,
      url: normalizeListingImageUrl(img.url),
      }))
      .sort((a, b) => imagePriority(a.url) - imagePriority(b.url));

    res.json({
      listing: row,
      images: normalizedImages,
      features: featureLinks,
      seller: sellerRows[0] ?? null,
      deletionRequestPending: pendingDel.length > 0,
    });
  } catch (err) {
    console.error("admin listing detail error", err);
    res.status(500).json({ error: "Failed to fetch listing" });
  }
});

router.patch("/admin/listings/:id", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const b = (req.body ?? {}) as Record<string, unknown>;

    // ── helpers ──────────────────────────────────────────────────────────────
    const asStr = (v: unknown) => (typeof v === "string" ? v.trim() : undefined);
    const asNum = (v: unknown): number | undefined => {
      if (typeof v === "number" && Number.isFinite(v)) return v;
      if (typeof v === "string" && v.trim() !== "") {
        const n = Number(v);
        return Number.isFinite(n) ? n : undefined;
      }
      return undefined;
    };
    const asInt = (v: unknown) => { const n = asNum(v); return n === undefined ? undefined : Math.trunc(n); };

    // ── build core updates ────────────────────────────────────────────────────
    const validStatuses = ["active", "sold", "pending", "deleted", "suspended"] as const;
    const conditionValues = ["new", "used", "certified_pre_owned"] as const;

    const updates: Record<string, unknown> = { updatedAt: new Date() };

    const make = asStr(b.make);      if (make) updates.make = make;
    const model = asStr(b.model);    if (model) updates.model = model;
    const year = asInt(b.year);      if (year !== undefined) updates.year = year;
    const price = asNum(b.price);
    if (price !== undefined) {
      if (price <= 0) { res.status(400).json({ error: "Invalid price" }); return; }
      updates.price = price;
    }
    const location = asStr(b.location); if (location) updates.location = location;
    const cond = asStr(b.condition);
    if (cond && (conditionValues as readonly string[]).includes(cond)) updates.condition = cond;
    const status = asStr(b.status);
    if (status) {
      if (!(validStatuses as readonly string[]).includes(status)) {
        res.status(400).json({ error: "Invalid status" }); return;
      }
      updates.status = status;
    }
    const mileage = asInt(b.mileage); if (mileage !== undefined && mileage >= 0) updates.mileage = mileage;
    for (const k of ["color", "carType", "transmission", "fuelType", "driveType", "vin", "description"] as const) {
      const v = asStr(b[k]); if (v !== undefined) updates[k] = v || null;
    }
    for (const k of ["doors", "seats"] as const) {
      const v = asInt(b[k]); if (v !== undefined) updates[k] = v;
    }

    // ── persist core fields ───────────────────────────────────────────────────
    const [updated] = await db.update(listingsTable).set(updates).where(eq(listingsTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Listing not found" }); return; }

    // ── images (replace-all when provided) ───────────────────────────────────
    if (Array.isArray(b.images)) {
      const isPersistable = (url: string) =>
        /^https?:\/\//i.test(url) ||
        /^\/api\/storage\/(objects|public-objects|local)\//.test(url);
      const imgs = (b.images as unknown[])
        .map((entry) => {
          if (entry && typeof entry === "object") {
            const e = entry as Record<string, unknown>;
            const url = asStr(e.url);
            if (!url || !isPersistable(url)) return null;
            const mediaType = asStr(e.mediaType) === "video" ? ("video" as const) : ("image" as const);
            const fileName = asStr(e.fileName) ?? null;
            const fileSize = asInt(e.fileSize) ?? null;
            return { url, mediaType, fileName, fileSize };
          }
          return null;
        })
        .filter((x): x is NonNullable<typeof x> => !!x)
        .slice(0, 20);

      const previousImages = await db
        .select({ url: listingImagesTable.url })
        .from(listingImagesTable)
        .where(eq(listingImagesTable.listingId, id));
      const newUrlSet = new Set(imgs.map((img) => img.url));
      const removedUrls = previousImages
        .map((row) => row.url)
        .filter((url) => !newUrlSet.has(url));

      await db.delete(listingImagesTable).where(eq(listingImagesTable.listingId, id));
      if (imgs.length > 0) {
        await db.insert(listingImagesTable).values(
          imgs.map((img, idx) => ({
            listingId: id,
            url: img.url,
            mediaType: img.mediaType,
            fileName: img.fileName,
            fileSize: img.fileSize,
            displayOrder: idx,
            isPrimary: idx === 0 && img.mediaType !== "video",
          })),
        );
      }

      if (removedUrls.length > 0) {
        for (const oldUrl of removedUrls) {
          void deleteManagedMediaRef(oldUrl);
        }
      }
    }

    // ── features (replace-all when provided) ─────────────────────────────────
    if (Array.isArray(b.featureIds)) {
      const ids = (b.featureIds as unknown[])
        .map((v) => asInt(v))
        .filter((v): v is number => v !== undefined && v > 0)
        .slice(0, 50);
      await db.delete(listingFeatureLinksTable).where(eq(listingFeatureLinksTable.listingId, id));
      if (ids.length > 0) {
        await db.insert(listingFeatureLinksTable)
          .values(ids.map((featureId) => ({ listingId: id, featureId })))
          .onConflictDoNothing();
      }
    }

    res.json({ listing: updated });
  } catch (err) {
    console.error("admin listing patch error", err);
    res.status(500).json({ error: "Failed to update listing" });
  }
});

router.delete("/admin/listings/:id", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const [updated] = await db
      .update(listingsTable)
      .set({ status: "deleted", updatedAt: new Date() })
      .where(eq(listingsTable.id, id))
      .returning({ id: listingsTable.id });
    if (!updated) { res.status(404).json({ error: "Listing not found" }); return; }

    res.json({ success: true });
  } catch (err) {
    console.error("admin listing delete error", err);
    res.status(500).json({ error: "Failed to delete listing" });
  }
});

router.get("/admin/listings/:id/offers", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const buyerUsers = alias(usersTable, "buyer_users_off");
    const rows = await db
      .select({
        id: offersTable.id,
        listingId: offersTable.listingId,
        buyerId: offersTable.buyerId,
        amount: offersTable.amount,
        counterAmount: offersTable.counterAmount,
        status: offersTable.status,
        buyerMessage: offersTable.buyerMessage,
        createdAt: offersTable.createdAt,
        buyerFirstName: buyerUsers.firstName,
        buyerLastName: buyerUsers.lastName,
        buyerEmail: buyerUsers.email,
      })
      .from(offersTable)
      .leftJoin(buyerUsers, eq(buyerUsers.id, offersTable.buyerId))
      .where(eq(offersTable.listingId, id))
      .orderBy(desc(offersTable.createdAt));

    res.json({ offers: rows });
  } catch (err) {
    console.error("admin listing offers error", err);
    res.status(500).json({ error: "Failed to fetch offers" });
  }
});

// ─── GET /admin/offers — paginated offer list ─────────────────────────────────
router.get("/admin/offers", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const {
      page = "1",
      pageSize = "10",
      search = "",
      status = "",
    } = req.query as Record<string, string>;

    const p = Math.max(1, parseInt(page) || 1);
    const ps = Math.min(50, Math.max(1, parseInt(pageSize) || 10));
    const offset = (p - 1) * ps;

    const validStatuses = [
      "pending", "accepted", "declined", "countered", "completed", "expired", "cancelled",
    ];

    const sellerU = alias(usersTable, "seller_u_offers");

    const conditions: ReturnType<typeof eq>[] = [];
    if (status && validStatuses.includes(status)) {
      conditions.push(eq(offersTable.status, status as "pending"));
    }
    if (search.trim()) {
      const q = `%${search.trim()}%`;
      conditions.push(
        or(
          ilike(listingsTable.make, q),
          ilike(listingsTable.model, q),
          ilike(sellerU.firstName, q),
          ilike(sellerU.lastName, q),
          ilike(sellerProfilesTable.businessName, q),
        )! as ReturnType<typeof eq>,
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, [{ total }]] = await Promise.all([
      db
        .select({
          id: offersTable.id,
          listingId: offersTable.listingId,
          buyerId: offersTable.buyerId,
          make: listingsTable.make,
          model: listingsTable.model,
          year: listingsTable.year,
          sellerFirstName: sellerU.firstName,
          sellerLastName: sellerU.lastName,
          sellerBusiness: sellerProfilesTable.businessName,
          amount: offersTable.amount,
          status: offersTable.status,
          createdAt: offersTable.createdAt,
        })
        .from(offersTable)
        .innerJoin(listingsTable, eq(listingsTable.id, offersTable.listingId))
        .innerJoin(sellerU, eq(sellerU.id, offersTable.sellerId))
        .leftJoin(sellerProfilesTable, eq(sellerProfilesTable.userId, offersTable.sellerId))
        .where(where)
        .orderBy(desc(offersTable.createdAt))
        .limit(ps)
        .offset(offset),
      db
        .select({ total: count() })
        .from(offersTable)
        .innerJoin(listingsTable, eq(listingsTable.id, offersTable.listingId))
        .innerJoin(sellerU, eq(sellerU.id, offersTable.sellerId))
        .leftJoin(sellerProfilesTable, eq(sellerProfilesTable.userId, offersTable.sellerId))
        .where(where),
    ]);

    const listingIds = [...new Set(rows.map((r) => r.listingId))];
    const buyerIds = [...new Set(rows.map((r) => r.buyerId))];

    const [offerCounts, inspRows] = await Promise.all([
      listingIds.length > 0
        ? db
            .select({ listingId: offersTable.listingId, cnt: count() })
            .from(offersTable)
            .where(inArray(offersTable.listingId, listingIds))
            .groupBy(offersTable.listingId)
        : Promise.resolve([] as { listingId: number; cnt: number }[]),
      rows.length > 0
        ? db
            .select({
              listingId: inspectionsTable.listingId,
              buyerId: inspectionsTable.buyerId,
              status: inspectionsTable.status,
              overallC: inspectionReportsTable.overallCondition,
              docVerified: inspectionReportsTable.documentsVerified,
              odomVerified: inspectionReportsTable.odometerVerified,
              vinVerified: inspectionReportsTable.vinVerified,
              bodyC: inspectionReportsTable.bodyCondition,
              engineC: inspectionReportsTable.engineCondition,
              interiorC: inspectionReportsTable.interiorCondition,
              electricalC: inspectionReportsTable.electricalCondition,
              suspensionC: inspectionReportsTable.suspensionCondition,
              tyreC: inspectionReportsTable.tyreCondition,
            })
            .from(inspectionsTable)
            .leftJoin(
              inspectionReportsTable,
              eq(inspectionReportsTable.inspectionId, inspectionsTable.id),
            )
            .where(
              and(
                inArray(inspectionsTable.listingId, listingIds),
                inArray(inspectionsTable.buyerId, buyerIds),
              ),
            )
            .orderBy(desc(inspectionsTable.createdAt))
        : Promise.resolve(
            [] as {
              listingId: number; buyerId: number; status: string;
              overallC: string | null;
              docVerified: boolean | null; odomVerified: boolean | null; vinVerified: boolean | null;
              bodyC: string | null; engineC: string | null; interiorC: string | null;
              electricalC: string | null; suspensionC: string | null; tyreC: string | null;
            }[],
          ),
    ]);

    const offerCountMap: Record<number, number> = {};
    for (const c of offerCounts) offerCountMap[c.listingId] = Number(c.cnt);

    const inspMap: Record<string, { status: string; passRate: number | null }> = {};
    for (const i of inspRows) {
      const key = `${i.listingId}:${i.buyerId}`;
      if (inspMap[key]) continue;
      let passRate: number | null = null;
      if (i.status === "completed") {
        const hasReport =
          i.overallC !== null ||
          i.bodyC !== null ||
          i.engineC !== null ||
          i.interiorC !== null ||
          i.electricalC !== null ||
          i.suspensionC !== null ||
          i.tyreC !== null;
        passRate = hasReport
          ? calcInspectionPassRate({
              overallCondition: i.overallC,
              bodyCondition: i.bodyC,
              engineCondition: i.engineC,
              interiorCondition: i.interiorC,
              electricalCondition: i.electricalC,
              suspensionCondition: i.suspensionC,
              tyreCondition: i.tyreC,
            })
          : null;
      }
      inspMap[key] = { status: i.status, passRate };
    }

    const items = rows.map((r) => ({
      id: r.id,
      listingId: r.listingId,
      make: r.make,
      model: r.model,
      year: r.year,
      sellerName:
        r.sellerBusiness ||
        [r.sellerFirstName, r.sellerLastName].filter(Boolean).join(" ") ||
        "—",
      amount: r.amount,
      offerCount: offerCountMap[r.listingId] ?? 0,
      inspectionStatus: inspMap[`${r.listingId}:${r.buyerId}`]?.status ?? null,
      inspectionPassRate: inspMap[`${r.listingId}:${r.buyerId}`]?.passRate ?? null,
      status: r.status,
      createdAt: r.createdAt,
    }));

    res.json({
      items,
      pagination: {
        page: p,
        pageSize: ps,
        total: Number(total),
        totalPages: Math.ceil(Number(total) / ps),
      },
    });
  } catch (err) {
    console.error("admin offers list error", err);
    res.status(500).json({ error: "Failed to fetch offers" });
  }
});

// ─── GET /admin/categories ────────────────────────────────────────────────────
router.get("/admin/categories", requireAdmin, async (_req: AuthRequest, res) => {
  try {
    const rows = await db
      .select()
      .from(carCategoriesTable)
      .orderBy(asc(carCategoriesTable.name));
    res.json(rows);
  } catch (err) {
    console.error("admin categories list", err);
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});

// ─── POST /admin/categories ───────────────────────────────────────────────────
router.post("/admin/categories", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const { name, description, imageUrl, isActive } = req.body as {
      name?: string;
      description?: string;
      imageUrl?: string;
      isActive?: boolean;
    };
    if (!name?.trim()) return res.status(400).json({ error: "name is required" });
    const [row] = await db
      .insert(carCategoriesTable)
      .values({
        name: name.trim(),
        description: description?.trim() ?? null,
        imageUrl: imageUrl?.trim() ?? null,
        isActive: isActive ?? true,
      })
      .returning();
    res.status(201).json(row);
  } catch (err: unknown) {
    if ((err as { code?: string }).code === "23505")
      return res.status(409).json({ error: "Category name already exists" });
    console.error("admin category create", err);
    res.status(500).json({ error: "Failed to create category" });
  }
});

// ─── PATCH /admin/categories/:id ─────────────────────────────────────────────
router.patch("/admin/categories/:id", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const { name, description, imageUrl, isActive } = req.body as {
      name?: string;
      description?: string;
      imageUrl?: string;
      isActive?: boolean;
    };
    const [row] = await db
      .update(carCategoriesTable)
      .set({
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description.trim() }),
        ...(imageUrl !== undefined && { imageUrl: imageUrl.trim() || null }),
        ...(isActive !== undefined && { isActive }),
        updatedAt: new Date(),
      })
      .where(eq(carCategoriesTable.id, id))
      .returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (err: unknown) {
    if ((err as { code?: string }).code === "23505")
      return res.status(409).json({ error: "Category name already exists" });
    console.error("admin category update", err);
    res.status(500).json({ error: "Failed to update category" });
  }
});

// ─── DELETE /admin/categories/:id ────────────────────────────────────────────
router.delete("/admin/categories/:id", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    await db.delete(carCategoriesTable).where(eq(carCategoriesTable.id, id));
    res.json({ success: true });
  } catch (err) {
    console.error("admin category delete", err);
    res.status(500).json({ error: "Failed to delete category" });
  }
});

// ─── GET /admin/features ──────────────────────────────────────────────────────
router.get("/admin/features", requireAdmin, async (_req: AuthRequest, res) => {
  try {
    const rows = await db
      .select()
      .from(carFeaturesTable)
      .orderBy(carFeaturesTable.featureGroup, asc(carFeaturesTable.name));
    res.json(rows);
  } catch (err) {
    console.error("admin features list", err);
    res.status(500).json({ error: "Failed to fetch features" });
  }
});

// ─── POST /admin/features ─────────────────────────────────────────────────────
router.post("/admin/features", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const { name, icon, featureGroup } = req.body as {
      name?: string;
      icon?: string;
      featureGroup?: string;
    };
    if (!name?.trim()) return res.status(400).json({ error: "name is required" });
    const [row] = await db
      .insert(carFeaturesTable)
      .values({
        name: name.trim(),
        icon: icon?.trim() ?? null,
        featureGroup: featureGroup?.trim() ?? null,
      })
      .returning();
    res.status(201).json(row);
  } catch (err: unknown) {
    if ((err as { code?: string }).code === "23505")
      return res.status(409).json({ error: "Feature name already exists" });
    console.error("admin feature create", err);
    res.status(500).json({ error: "Failed to create feature" });
  }
});

// ─── PATCH /admin/features/:id ────────────────────────────────────────────────
router.patch("/admin/features/:id", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const { name, icon, featureGroup } = req.body as {
      name?: string;
      icon?: string;
      featureGroup?: string;
    };
    const [row] = await db
      .update(carFeaturesTable)
      .set({
        ...(name !== undefined && { name: name.trim() }),
        ...(icon !== undefined && { icon: icon.trim() || null }),
        ...(featureGroup !== undefined && { featureGroup: featureGroup.trim() || null }),
      })
      .where(eq(carFeaturesTable.id, id))
      .returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (err: unknown) {
    if ((err as { code?: string }).code === "23505")
      return res.status(409).json({ error: "Feature name already exists" });
    console.error("admin feature update", err);
    res.status(500).json({ error: "Failed to update feature" });
  }
});

// ─── DELETE /admin/features/:id ───────────────────────────────────────────────
router.delete("/admin/features/:id", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    await db.delete(carFeaturesTable).where(eq(carFeaturesTable.id, id));
    res.json({ success: true });
  } catch (err) {
    console.error("admin feature delete", err);
    res.status(500).json({ error: "Failed to delete feature" });
  }
});

// ─── Helper: compute inspection result percent (same logic as buyer side) ───
function calcInspectionPassRate(r: {
  overallCondition: string | null;
  bodyCondition: string | null;
  engineCondition: string | null;
  interiorCondition: string | null;
  electricalCondition: string | null;
  suspensionCondition: string | null;
  tyreCondition: string | null;
}): number {
  const pct = (c: string | null): number | null => {
    if (!c) return null;
    if (c === "excellent") return 100;
    if (c === "good") return 75;
    if (c === "fair") return 50;
    if (c === "poor") return 25;
    return null;
  };
  const parts = [
    r.overallCondition,
    r.bodyCondition,
    r.engineCondition,
    r.interiorCondition,
    r.electricalCondition,
    r.suspensionCondition,
    r.tyreCondition,
  ]
    .map(pct)
    .filter((v): v is number => v !== null);
  if (!parts.length) return 0;
  return Math.round(parts.reduce((s, n) => s + n, 0) / parts.length);
}

// ─── GET /admin/purchases ─────────────────────────────────────────────────────
router.get("/admin/purchases", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const p = Math.max(1, parseInt(String(req.query.page ?? "1")));
    const ps = Math.min(50, Math.max(1, parseInt(String(req.query.pageSize ?? "10"))));
    const offset = (p - 1) * ps;
    const search = String(req.query.search ?? "").trim();
    const status = String(req.query.status ?? "").trim();

    const buyerU = alias(usersTable, "buyer_u");
    const sellerU = alias(usersTable, "seller_u");

    const conditions: ReturnType<typeof eq>[] = [];
    if (status) {
      conditions.push(
        eq(purchasesTable.paymentStatus, status as "pending" | "in_escrow" | "completed" | "failed" | "refunded")
      );
    }
    if (search) {
      conditions.push(
        or(
          ilike(listingsTable.make, `%${search}%`),
          ilike(listingsTable.model, `%${search}%`),
          ilike(buyerU.firstName, `%${search}%`),
          ilike(buyerU.lastName, `%${search}%`),
          ilike(sellerU.firstName, `%${search}%`),
          ilike(sellerU.lastName, `%${search}%`),
          ilike(sellerProfilesTable.businessName, `%${search}%`),
        )! as ReturnType<typeof eq>,
      );
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, [{ total }]] = await Promise.all([
      db
        .select({
          id: purchasesTable.id,
          listingId: purchasesTable.listingId,
          make: listingsTable.make,
          model: listingsTable.model,
          year: listingsTable.year,
          buyerFirstName: buyerU.firstName,
          buyerLastName: buyerU.lastName,
          sellerFirstName: sellerU.firstName,
          sellerLastName: sellerU.lastName,
          sellerBusiness: sellerProfilesTable.businessName,
          amount: purchasesTable.amount,
          paymentStatus: purchasesTable.paymentStatus,
          receiptNumber: purchasesTable.receiptNumber,
          createdAt: purchasesTable.createdAt,
        })
        .from(purchasesTable)
        .innerJoin(listingsTable, eq(listingsTable.id, purchasesTable.listingId))
        .innerJoin(buyerU, eq(buyerU.id, purchasesTable.buyerId))
        .innerJoin(sellerU, eq(sellerU.id, purchasesTable.sellerId))
        .leftJoin(sellerProfilesTable, eq(sellerProfilesTable.userId, purchasesTable.sellerId))
        .where(where)
        .orderBy(desc(purchasesTable.createdAt))
        .limit(ps)
        .offset(offset),
      db
        .select({ total: count() })
        .from(purchasesTable)
        .innerJoin(listingsTable, eq(listingsTable.id, purchasesTable.listingId))
        .innerJoin(buyerU, eq(buyerU.id, purchasesTable.buyerId))
        .innerJoin(sellerU, eq(sellerU.id, purchasesTable.sellerId))
        .leftJoin(sellerProfilesTable, eq(sellerProfilesTable.userId, purchasesTable.sellerId))
        .where(where),
    ]);

    res.json({
      items: rows.map((r) => ({
        id: r.id,
        make: r.make,
        model: r.model,
        year: r.year,
        sellerName:
          r.sellerBusiness ||
          [r.sellerFirstName, r.sellerLastName].filter(Boolean).join(" ") ||
          "—",
        buyerName:
          [r.buyerFirstName, r.buyerLastName].filter(Boolean).join(" ") || "—",
        amount: r.amount,
        paymentStatus: r.paymentStatus,
        receiptNumber: r.receiptNumber,
        createdAt: r.createdAt,
      })),
      pagination: {
        page: p,
        pageSize: ps,
        total: Number(total),
        totalPages: Math.ceil(Number(total) / ps),
      },
    });
  } catch (err) {
    console.error("admin purchases list error", err);
    res.status(500).json({ error: "Failed to fetch purchases" });
  }
});

// ─── GET /admin/purchases/:id  (receipt detail) ───────────────────────────────
router.get("/admin/purchases/:id", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    const buyerU = alias(usersTable, "buyer_u");
    const sellerU = alias(usersTable, "seller_u");

    const [purchase] = await db
      .select({
        id: purchasesTable.id,
        listingId: purchasesTable.listingId,
        amount: purchasesTable.amount,
        platformFee: purchasesTable.platformFee,
        receiptNumber: purchasesTable.receiptNumber,
        createdAt: purchasesTable.createdAt,
        make: listingsTable.make,
        model: listingsTable.model,
        year: listingsTable.year,
        vin: listingsTable.vin,
        mileage: listingsTable.mileage,
        condition: listingsTable.condition,
        buyerFirstName: buyerU.firstName,
        buyerLastName: buyerU.lastName,
        buyerEmail: buyerU.email,
        buyerPhone: buyerU.phone,
        sellerFirstName: sellerU.firstName,
        sellerLastName: sellerU.lastName,
        sellerEmail: sellerU.email,
        sellerPhone: sellerU.phone,
        sellerBusiness: sellerProfilesTable.businessName,
      })
      .from(purchasesTable)
      .innerJoin(listingsTable, eq(listingsTable.id, purchasesTable.listingId))
      .innerJoin(buyerU, eq(buyerU.id, purchasesTable.buyerId))
      .innerJoin(sellerU, eq(sellerU.id, purchasesTable.sellerId))
      .leftJoin(sellerProfilesTable, eq(sellerProfilesTable.userId, purchasesTable.sellerId))
      .where(eq(purchasesTable.id, id));

    if (!purchase) return res.status(404).json({ error: "Not found" });

    const [firstImage] = await db
      .select({ url: listingImagesTable.url })
      .from(listingImagesTable)
      .where(eq(listingImagesTable.listingId, purchase.listingId))
      .orderBy(asc(listingImagesTable.displayOrder))
      .limit(1);

    const sellerPhone = purchase.sellerPhone || "";
    const sellerName =
      purchase.sellerBusiness ||
      [purchase.sellerFirstName, purchase.sellerLastName]
        .filter(Boolean)
        .join(" ") ||
      "—";

    res.json({
      id: purchase.id,
      invoiceNo:
        purchase.receiptNumber ||
        `H${purchase.id}-${purchase.make}`,
      seller: {
        name: [purchase.sellerFirstName, purchase.sellerLastName]
          .filter(Boolean)
          .join(" "),
        company: purchase.sellerBusiness || "—",
        phone: sellerPhone,
        email: purchase.sellerEmail || "",
      },
      middleman: {
        company: "Huce Autos",
        phone: "08000000000",
        email: "support@huceautos.com",
      },
      buyer: {
        name:
          [purchase.buyerFirstName, purchase.buyerLastName]
            .filter(Boolean)
            .join(" ") || "—",
        phone: purchase.buyerPhone || "",
        email: purchase.buyerEmail || "",
      },
      car: {
        make: `${purchase.make} ${purchase.model} ${purchase.year}`,
        vin: purchase.vin || "—",
        mileage: purchase.mileage
          ? `${Number(purchase.mileage).toLocaleString()}km`
          : "—",
        condition: purchase.condition || "—",
        purchaseDate: new Date(purchase.createdAt).toLocaleDateString("en-US", {
          month: "numeric",
          day: "numeric",
          year: "numeric",
        }),
        image: firstImage?.url,
      },
      summation: {
        subTotal: purchase.amount,
        discount: 0,
        total: purchase.amount,
      },
    });
  } catch (err) {
    console.error("admin purchase detail error", err);
    res.status(500).json({ error: "Failed to fetch purchase" });
  }
});

// ─── GET /admin/inspections ───────────────────────────────────────────────────
router.get("/admin/inspections", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const p = Math.max(1, parseInt(String(req.query.page ?? "1")));
    const ps = Math.min(50, Math.max(1, parseInt(String(req.query.pageSize ?? "10"))));
    const offset = (p - 1) * ps;
    const search = String(req.query.search ?? "").trim();
    const status = String(req.query.status ?? "").trim();

    const buyerU = alias(usersTable, "buyer_u");
    const sellerU = alias(usersTable, "seller_u");

    const conditions: ReturnType<typeof eq>[] = [];
    if (status) {
      conditions.push(
        eq(inspectionsTable.status, status as "pending" | "assigned" | "active" | "completed" | "cancelled")
      );
    }
    if (search) {
      conditions.push(
        or(
          ilike(listingsTable.make, `%${search}%`),
          ilike(listingsTable.model, `%${search}%`),
          ilike(buyerU.firstName, `%${search}%`),
          ilike(buyerU.lastName, `%${search}%`),
          ilike(sellerU.firstName, `%${search}%`),
          ilike(sellerU.lastName, `%${search}%`),
          ilike(sellerProfilesTable.businessName, `%${search}%`),
        )! as ReturnType<typeof eq>,
      );
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, [{ total }]] = await Promise.all([
      db
        .select({
          id: inspectionsTable.id,
          listingId: inspectionsTable.listingId,
          make: listingsTable.make,
          model: listingsTable.model,
          year: listingsTable.year,
          buyerFirstName: buyerU.firstName,
          buyerLastName: buyerU.lastName,
          sellerFirstName: sellerU.firstName,
          sellerLastName: sellerU.lastName,
          sellerBusiness: sellerProfilesTable.businessName,
          inspectorEarnings: inspectionsTable.inspectorEarnings,
          status: inspectionsTable.status,
          completedAt: inspectionsTable.completedAt,
          updatedAt: inspectionsTable.updatedAt,
          reportOverall: inspectionReportsTable.overallCondition,
          reportBody: inspectionReportsTable.bodyCondition,
          reportEngine: inspectionReportsTable.engineCondition,
          reportInterior: inspectionReportsTable.interiorCondition,
          reportElectrical: inspectionReportsTable.electricalCondition,
          reportSuspension: inspectionReportsTable.suspensionCondition,
          reportTyre: inspectionReportsTable.tyreCondition,
          reportDocsVerified: inspectionReportsTable.documentsVerified,
          reportOdoVerified: inspectionReportsTable.odometerVerified,
          reportVinVerified: inspectionReportsTable.vinVerified,
        })
        .from(inspectionsTable)
        .innerJoin(listingsTable, eq(listingsTable.id, inspectionsTable.listingId))
        .innerJoin(buyerU, eq(buyerU.id, inspectionsTable.buyerId))
        .innerJoin(sellerU, eq(sellerU.id, listingsTable.sellerId))
        .leftJoin(sellerProfilesTable, eq(sellerProfilesTable.userId, listingsTable.sellerId))
        .leftJoin(inspectionReportsTable, eq(inspectionReportsTable.inspectionId, inspectionsTable.id))
        .where(where)
        .orderBy(desc(inspectionsTable.createdAt))
        .limit(ps)
        .offset(offset),
      db
        .select({ total: count() })
        .from(inspectionsTable)
        .innerJoin(listingsTable, eq(listingsTable.id, inspectionsTable.listingId))
        .innerJoin(buyerU, eq(buyerU.id, inspectionsTable.buyerId))
        .innerJoin(sellerU, eq(sellerU.id, listingsTable.sellerId))
        .leftJoin(sellerProfilesTable, eq(sellerProfilesTable.userId, listingsTable.sellerId))
        .leftJoin(inspectionReportsTable, eq(inspectionReportsTable.inspectionId, inspectionsTable.id))
        .where(where),
    ]);

    res.json({
      items: rows.map((r) => {
        const hasReport = r.reportBody !== undefined && r.reportBody !== null;
        const passRate = hasReport
          ? calcInspectionPassRate({
              overallCondition: r.reportOverall,
              bodyCondition: r.reportBody,
              engineCondition: r.reportEngine,
              interiorCondition: r.reportInterior,
              electricalCondition: r.reportElectrical,
              suspensionCondition: r.reportSuspension,
              tyreCondition: r.reportTyre,
            })
          : null;
        return {
          id: r.id,
          make: r.make,
          model: r.model,
          year: r.year,
          sellerName:
            r.sellerBusiness ||
            [r.sellerFirstName, r.sellerLastName].filter(Boolean).join(" ") ||
            "—",
          buyerName:
            [r.buyerFirstName, r.buyerLastName].filter(Boolean).join(" ") || "—",
          inspectorEarnings: r.inspectorEarnings,
          resultPercent: passRate,
          lastResponse: r.completedAt ?? r.updatedAt,
          status: r.status,
        };
      }),
      pagination: {
        page: p,
        pageSize: ps,
        total: Number(total),
        totalPages: Math.ceil(Number(total) / ps),
      },
    });
  } catch (err) {
    console.error("admin inspections list error", err);
    res.status(500).json({ error: "Failed to fetch inspections" });
  }
});

// ─── GET /admin/inspections/:id ───────────────────────────────────────────────
router.get("/admin/inspections/:id", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    const buyerU = alias(usersTable, "buyer_u");
    const sellerU = alias(usersTable, "seller_u");
    const inspectorU = alias(usersTable, "inspector_u");

    const [row] = await db
      .select({
        id: inspectionsTable.id,
        status: inspectionsTable.status,
        scheduledAt: inspectionsTable.scheduledAt,
        completedAt: inspectionsTable.completedAt,
        location: inspectionsTable.inspectionLocation,
        listingLocation: listingsTable.location,
        fee: inspectionsTable.fee,
        inspectorEarnings: inspectionsTable.inspectorEarnings,
        notes: inspectionsTable.notes,
        paidAt: inspectionsTable.paidAt,
        make: listingsTable.make,
        model: listingsTable.model,
        year: listingsTable.year,
        sellerFirstName: sellerU.firstName,
        sellerLastName: sellerU.lastName,
        sellerBusiness: sellerProfilesTable.businessName,
        buyerFirstName: buyerU.firstName,
        buyerLastName: buyerU.lastName,
        inspectorFirstName: inspectorU.firstName,
        inspectorLastName: inspectorU.lastName,
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
        documentsVerified: inspectionReportsTable.documentsVerified,
        odometerVerified: inspectionReportsTable.odometerVerified,
        vinVerified: inspectionReportsTable.vinVerified,
        images: inspectionReportsTable.images,
        reportDetails: inspectionReportsTable.reportDetails,
      })
      .from(inspectionsTable)
      .innerJoin(listingsTable, eq(listingsTable.id, inspectionsTable.listingId))
      .innerJoin(sellerU, eq(sellerU.id, listingsTable.sellerId))
      .innerJoin(buyerU, eq(buyerU.id, inspectionsTable.buyerId))
      .leftJoin(inspectorU, eq(inspectorU.id, inspectionsTable.inspectorId))
      .leftJoin(sellerProfilesTable, eq(sellerProfilesTable.userId, listingsTable.sellerId))
      .leftJoin(inspectionReportsTable, eq(inspectionReportsTable.inspectionId, inspectionsTable.id))
      .where(eq(inspectionsTable.id, id));

    if (!row) return res.status(404).json({ error: "Not found" });

    const hasReport = row.reportId !== null;
    const passRate = hasReport
      ? calcInspectionPassRate({
          overallCondition: row.overallCondition,
          bodyCondition: row.bodyCondition,
          engineCondition: row.engineCondition,
          interiorCondition: row.interiorCondition,
          electricalCondition: row.electricalCondition,
          suspensionCondition: row.suspensionCondition,
          tyreCondition: row.tyreCondition,
        })
      : null;

    function condPct(c: string | null): number | null {
      if (!c) return null;
      if (c === "excellent") return 100;
      if (c === "good") return 75;
      if (c === "fair") return 50;
      if (c === "poor") return 25;
      return null;
    }

    // Fetch available inspectors to power the admin assignment UI
    const availableInspectors = await db
      .select({
        userId: usersTable.id,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        serviceArea: inspectorProfilesTable.serviceArea,
        rating: inspectorProfilesTable.rating,
        totalInspections: inspectorProfilesTable.totalInspections,
      })
      .from(inspectorProfilesTable)
      .innerJoin(usersTable, eq(usersTable.id, inspectorProfilesTable.userId))
      .where(
        and(
          eq(inspectorProfilesTable.isAvailable, true),
          eq(usersTable.role, "inspector"),
        ),
      )
      .orderBy(desc(inspectorProfilesTable.rating));

    const effectiveLocation = row.location ?? row.listingLocation ?? null;
    const sameLocationInspectors = availableInspectors.filter((insp) =>
      isSameLocationMatch(effectiveLocation, insp.serviceArea),
    );

    res.json({
      id: row.id,
      status: row.status,
      scheduledAt: row.scheduledAt,
      completedAt: row.completedAt,
      location: effectiveLocation,
      fee: row.fee,
      inspectorEarnings: row.inspectorEarnings,
      paidAt: row.paidAt,
      carDetails: `${row.make} ${row.model}, ${row.year}`,
      sellerName:
        row.sellerBusiness ||
        [row.sellerFirstName, row.sellerLastName].filter(Boolean).join(" ") ||
        "—",
      buyerName:
        [row.buyerFirstName, row.buyerLastName].filter(Boolean).join(" ") || "—",
      inspectorName: row.inspectorFirstName
        ? [row.inspectorFirstName, row.inspectorLastName].filter(Boolean).join(" ")
        : null,
      availableInspectors,
      sameLocationInspectors,
      resultPercent: passRate,
      report: hasReport
        ? {
            id: row.reportId!,
            summary: row.summary,
            recommendedActions: row.recommendedActions,
            overallPercent: passRate,
            sections: {
              exterior: { status: row.bodyCondition, percent: condPct(row.bodyCondition) },
              interior: { status: row.interiorCondition, percent: condPct(row.interiorCondition) },
              engineTransmission: { status: row.engineCondition, percent: condPct(row.engineCondition) },
              suspensionBrakes: { status: row.suspensionCondition, percent: condPct(row.suspensionCondition) },
              tiresWheels: { status: row.tyreCondition, percent: condPct(row.tyreCondition) },
              lightsElectricals: { status: row.electricalCondition, percent: condPct(row.electricalCondition) },
            },
            images: row.images ?? [],
            details: row.reportDetails,
          }
        : null,
    });
  } catch (err) {
    console.error("admin inspection detail error", err);
    res.status(500).json({ error: "Failed to fetch inspection" });
  }
});

// ─── GET /admin/inspection-types ─────────────────────────────────────────────
router.get("/admin/inspection-types", requireAdmin, async (_req: AuthRequest, res) => {
  try {
    const types = await db
      .select()
      .from(inspectionTypesTable)
      .orderBy(asc(inspectionTypesTable.createdAt));
    res.json(types);
  } catch (err) {
    console.error("admin inspection-types list error", err);
    res.status(500).json({ error: "Failed to fetch inspection types" });
  }
});

// ─── POST /admin/inspection-types ────────────────────────────────────────────
router.post("/admin/inspection-types", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const { name, description, price, durationHours, isActive } = req.body as {
      name?: string;
      description?: string;
      price?: number;
      durationHours?: number;
      isActive?: boolean;
    };
    if (!name || price == null) {
      return res.status(400).json({ error: "name and price are required" });
    }
    const [created] = await db
      .insert(inspectionTypesTable)
      .values({
        name: name.trim(),
        description: description?.trim() ?? null,
        price: Number(price),
        durationHours: Number(durationHours ?? 2),
        isActive: isActive ?? true,
      })
      .returning();
    res.status(201).json(created);
  } catch (err) {
    console.error("admin inspection-type create error", err);
    res.status(500).json({ error: "Failed to create inspection type" });
  }
});

// ─── PATCH /admin/inspection-types/:id ───────────────────────────────────────
router.patch("/admin/inspection-types/:id", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const { name, description, price, durationHours, isActive } = req.body as {
      name?: string;
      description?: string;
      price?: number;
      durationHours?: number;
      isActive?: boolean;
    };
    const [updated] = await db
      .update(inspectionTypesTable)
      .set({
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description.trim() }),
        ...(price !== undefined && { price: Number(price) }),
        ...(durationHours !== undefined && { durationHours: Number(durationHours) }),
        ...(isActive !== undefined && { isActive }),
        updatedAt: new Date(),
      })
      .where(eq(inspectionTypesTable.id, id))
      .returning();
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  } catch (err) {
    console.error("admin inspection-type update error", err);
    res.status(500).json({ error: "Failed to update inspection type" });
  }
});

// ─── DELETE /admin/inspection-types/:id ──────────────────────────────────────
router.delete("/admin/inspection-types/:id", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    await db.delete(inspectionTypesTable).where(eq(inspectionTypesTable.id, id));
    res.json({ success: true });
  } catch (err) {
    console.error("admin inspection-type delete error", err);
    res.status(500).json({ error: "Failed to delete inspection type" });
  }
});

// ─── GET /admin/subscription-plans ────────────────────────────────────────────
router.get("/admin/subscription-plans", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const search = (req.query.search as string | undefined)?.trim() ?? "";
    const page = Math.max(1, parseInt((req.query.page as string) || "1"));
    const limit = 20;
    const offset = (page - 1) * limit;

    const whereClause = search ? ilike(subscriptionPlansTable.name, `%${search}%`) : undefined;

    const [plans, totalResult] = await Promise.all([
      db
        .select({
          id: subscriptionPlansTable.id,
          name: subscriptionPlansTable.name,
          description: subscriptionPlansTable.description,
          price: subscriptionPlansTable.price,
          durationDays: subscriptionPlansTable.durationDays,
          maxListings: subscriptionPlansTable.maxListings,
          maxPhotos: subscriptionPlansTable.maxPhotos,
          featuredListingEnabled: subscriptionPlansTable.featuredListingEnabled,
          analyticsDashboardEnabled: subscriptionPlansTable.analyticsDashboardEnabled,
          features: subscriptionPlansTable.features,
          isFeatured: subscriptionPlansTable.isFeatured,
          isActive: subscriptionPlansTable.isActive,
          createdAt: subscriptionPlansTable.createdAt,
          activeSubscribers: sql<number>`
            (SELECT COUNT(*)::int FROM subscriptions
             WHERE plan_id = "subscription_plans"."id"
               AND status = 'active'
               AND expires_at > NOW())
          `.mapWith(Number),
        })
        .from(subscriptionPlansTable)
        .where(whereClause)
        .orderBy(asc(subscriptionPlansTable.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: count() })
        .from(subscriptionPlansTable)
        .where(whereClause),
    ]);

    res.json({
      plans,
      total: totalResult[0]?.total ?? 0,
      page,
      totalPages: Math.ceil((totalResult[0]?.total ?? 0) / limit),
    });
  } catch (err) {
    console.error("admin subscription-plans list", err);
    res.status(500).json({ error: "Failed to fetch subscription plans" });
  }
});

// ─── POST /admin/subscription-plans ───────────────────────────────────────────
router.post("/admin/subscription-plans", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const {
      name,
      description,
      price,
      durationDays,
      maxListings,
      maxPhotos,
      featuredListingEnabled,
      analyticsDashboardEnabled,
      features,
      isFeatured,
      isActive,
    } = req.body as {
      name?: string;
      description?: string;
      price?: number;
      durationDays?: number;
      maxListings?: number;
      maxPhotos?: number;
      featuredListingEnabled?: boolean;
      analyticsDashboardEnabled?: boolean;
      features?: string[];
      isFeatured?: boolean;
      isActive?: boolean;
    };

    if (!name?.trim()) return res.status(400).json({ error: "name is required" });
    if (price === undefined || price < 0) return res.status(400).json({ error: "valid price is required" });
    if (!durationDays || durationDays < 1) return res.status(400).json({ error: "durationDays must be >= 1" });

    const [row] = await db
      .insert(subscriptionPlansTable)
      .values({
        name: name.trim(),
        description: description?.trim() ?? null,
        price,
        durationDays,
        maxListings: maxListings ?? 10,
        maxPhotos: maxPhotos ?? 5,
        featuredListingEnabled: featuredListingEnabled ?? false,
        analyticsDashboardEnabled: analyticsDashboardEnabled ?? false,
        features: features ?? [],
        isFeatured: isFeatured ?? false,
        isActive: isActive ?? true,
      })
      .returning();

    res.status(201).json(row);
  } catch (err: unknown) {
    if ((err as { code?: string }).code === "23505")
      return res.status(409).json({ error: "Plan name already exists" });
    console.error("admin subscription-plan create", err);
    res.status(500).json({ error: "Failed to create subscription plan" });
  }
});

// ─── PATCH /admin/subscription-plans/:id ──────────────────────────────────────
router.patch("/admin/subscription-plans/:id", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    const {
      name,
      description,
      price,
      durationDays,
      maxListings,
      maxPhotos,
      featuredListingEnabled,
      analyticsDashboardEnabled,
      features,
      isFeatured,
      isActive,
    } = req.body as {
      name?: string;
      description?: string;
      price?: number;
      durationDays?: number;
      maxListings?: number;
      maxPhotos?: number;
      featuredListingEnabled?: boolean;
      analyticsDashboardEnabled?: boolean;
      features?: string[];
      isFeatured?: boolean;
      isActive?: boolean;
    };

    const [row] = await db
      .update(subscriptionPlansTable)
      .set({
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description.trim() }),
        ...(price !== undefined && { price }),
        ...(durationDays !== undefined && { durationDays }),
        ...(maxListings !== undefined && { maxListings }),
        ...(maxPhotos !== undefined && { maxPhotos }),
        ...(featuredListingEnabled !== undefined && { featuredListingEnabled }),
        ...(analyticsDashboardEnabled !== undefined && { analyticsDashboardEnabled }),
        ...(features !== undefined && { features }),
        ...(isFeatured !== undefined && { isFeatured }),
        ...(isActive !== undefined && { isActive }),
        updatedAt: new Date(),
      })
      .where(eq(subscriptionPlansTable.id, id))
      .returning();

    if (!row) return res.status(404).json({ error: "Plan not found" });
    res.json(row);
  } catch (err: unknown) {
    if ((err as { code?: string }).code === "23505")
      return res.status(409).json({ error: "Plan name already exists" });
    console.error("admin subscription-plan update", err);
    res.status(500).json({ error: "Failed to update subscription plan" });
  }
});

// ─── DELETE /admin/subscription-plans/:id ─────────────────────────────────────
router.delete("/admin/subscription-plans/:id", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    // Block deletion only if there are TRULY active (not yet expired) subscribers
    const now = new Date();
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(subscriptionsTable)
      .where(
        and(
          eq(subscriptionsTable.planId, id),
          eq(subscriptionsTable.status, "active"),
          gte(subscriptionsTable.expiresAt, now),
        ),
      );
    if (n > 0)
      return res.status(409).json({
        error: `Cannot delete this plan — it has ${n} active subscriber${n !== 1 ? "s" : ""}. Deactivate the plan instead.`,
      });

    // Remove any expired / cancelled subscriptions that reference this plan
    // (FK constraint would otherwise block the hard delete)
    await db
      .delete(subscriptionsTable)
      .where(eq(subscriptionsTable.planId, id));

    await db.delete(subscriptionPlansTable).where(eq(subscriptionPlansTable.id, id));
    res.json({ success: true });
  } catch (err) {
    console.error("admin subscription-plan delete", err);
    res.status(500).json({ error: "Failed to delete subscription plan" });
  }
});

// ─── GET /admin/inspectors/available ─────────────────────────────────────────
router.get("/admin/inspectors/available", requireAdmin, async (_req: AuthRequest, res) => {
  try {
    const inspectors = await db
      .select({
        userId: usersTable.id,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        serviceArea: inspectorProfilesTable.serviceArea,
        rating: inspectorProfilesTable.rating,
        totalInspections: inspectorProfilesTable.totalInspections,
      })
      .from(inspectorProfilesTable)
      .innerJoin(usersTable, eq(usersTable.id, inspectorProfilesTable.userId))
      .where(
        and(
          eq(inspectorProfilesTable.isAvailable, true),
          eq(usersTable.role, "inspector"),
        ),
      )
      .orderBy(desc(inspectorProfilesTable.rating));
    res.json(inspectors);
  } catch (err) {
    console.error("admin available inspectors error", err);
    res.status(500).json({ error: "Failed to fetch inspectors" });
  }
});

// ─── PATCH /admin/inspections/:id/assign ─────────────────────────────────────
router.patch("/admin/inspections/:id/assign", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    const inspectorId = Number((req.body as { inspectorId?: unknown }).inspectorId);
    if (!inspectorId || isNaN(inspectorId)) {
      return res.status(400).json({ error: "inspectorId is required" });
    }

    const [inspection] = await db
      .select({
        id: inspectionsTable.id,
        status: inspectionsTable.status,
        listingId: inspectionsTable.listingId,
        scheduledAt: inspectionsTable.scheduledAt,
        location: inspectionsTable.inspectionLocation,
      })
      .from(inspectionsTable)
      .where(eq(inspectionsTable.id, id))
      .limit(1);

    if (!inspection) return res.status(404).json({ error: "Inspection not found" });
    if (inspection.status === "completed" || inspection.status === "cancelled") {
      return res.status(409).json({ error: "Cannot reassign a completed or cancelled inspection" });
    }

    const [inspector] = await db
      .select({
        id: usersTable.id,
        email: usersTable.email,
        firstName: usersTable.firstName,
      })
      .from(usersTable)
      .where(and(eq(usersTable.id, inspectorId), eq(usersTable.role, "inspector")))
      .limit(1);

    if (!inspector) return res.status(404).json({ error: "Inspector not found" });

    await db
      .update(inspectionsTable)
      .set({ inspectorId, status: "assigned", updatedAt: new Date() })
      .where(eq(inspectionsTable.id, id));

    const [listing] = await db
      .select({
        make: listingsTable.make,
        model: listingsTable.model,
        year: listingsTable.year,
        location: listingsTable.location,
      })
      .from(listingsTable)
      .where(eq(listingsTable.id, inspection.listingId))
      .limit(1);
    const carName = listing
      ? `${listing.make} ${listing.model} ${listing.year}`
      : "Assigned vehicle";
    const effectiveLocation = inspection.location ?? listing?.location ?? null;

    void createNotification({
      userId: inspectorId,
      type: "system",
      title: "New inspection assignment",
      message: `You have been assigned inspection #${id}.`,
      entityType: "inspection",
      entityId: id,
      priority: "high",
      data: {
        inspectionId: id,
      },
    }).catch(() => {});

    void sendInspectionAssignedEmail({
      email: inspector.email,
      firstName: inspector.firstName || "Inspector",
      inspectionId: id,
      carName,
      scheduledAt: inspection.scheduledAt,
      location: effectiveLocation,
    }).catch(() => {});

    res.json({ success: true, inspectorId });
  } catch (err) {
    console.error("admin inspection assign error", err);
    res.status(500).json({ error: "Failed to assign inspector" });
  }
});

// ─── POST /admin/inspections/:id/auto-assign ─────────────────────────────────
router.post("/admin/inspections/:id/auto-assign", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    const [inspection] = await db
      .select({ id: inspectionsTable.id, status: inspectionsTable.status, inspectorId: inspectionsTable.inspectorId })
      .from(inspectionsTable)
      .where(eq(inspectionsTable.id, id))
      .limit(1);

    if (!inspection) return res.status(404).json({ error: "Inspection not found" });
    if (inspection.status === "completed" || inspection.status === "cancelled") {
      return res.status(409).json({ error: "Cannot auto-assign a completed or cancelled inspection" });
    }

    const assignedUserId = await autoAssignInspector(id);

    if (!assignedUserId) {
      return res.status(422).json({ error: "No available inspector found near this location" });
    }

    const [assignedInspection] = await db
      .select({
        id: inspectionsTable.id,
        listingId: inspectionsTable.listingId,
        scheduledAt: inspectionsTable.scheduledAt,
        location: inspectionsTable.inspectionLocation,
      })
      .from(inspectionsTable)
      .where(eq(inspectionsTable.id, id))
      .limit(1);

    const [assignedInspector] = await db
      .select({
        email: usersTable.email,
        firstName: usersTable.firstName,
      })
      .from(usersTable)
      .where(eq(usersTable.id, assignedUserId))
      .limit(1);

    if (assignedInspection && assignedInspector) {
      const [listing] = await db
        .select({
          make: listingsTable.make,
          model: listingsTable.model,
          year: listingsTable.year,
          location: listingsTable.location,
        })
        .from(listingsTable)
        .where(eq(listingsTable.id, assignedInspection.listingId))
        .limit(1);

      const carName = listing
        ? `${listing.make} ${listing.model} ${listing.year}`
        : "Assigned vehicle";
      const effectiveLocation =
        assignedInspection.location ?? listing?.location ?? null;

      void createNotification({
        userId: assignedUserId,
        type: "system",
        title: "New inspection assignment",
        message: `You have been assigned inspection #${id}.`,
        entityType: "inspection",
        entityId: id,
        priority: "high",
        data: { inspectionId: id },
      }).catch(() => {});

      void sendInspectionAssignedEmail({
        email: assignedInspector.email,
        firstName: assignedInspector.firstName || "Inspector",
        inspectionId: id,
        carName,
        scheduledAt: assignedInspection.scheduledAt,
        location: effectiveLocation,
      }).catch(() => {});
    }

    res.json({ success: true, inspectorId: assignedUserId });
  } catch (err) {
    console.error("admin inspection auto-assign error", err);
    res.status(500).json({ error: "Failed to auto-assign inspector" });
  }
});

// ─── Admin Finance Endpoints ──────────────────────────────────────────────────

// GET /admin/finances/stats
// Returns platform-wide financial summary stats.
router.get("/admin/finances/stats", requireAdmin, async (_req: AuthRequest, res) => {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [[allPurchases], [monthPurchases], [subRevenue], [monthSubRevenue], [withdrawalFees], [monthWithdrawalFees]] = await Promise.all([
      db.select({
        totalFees: sql<number>`COALESCE(SUM(CASE WHEN ${purchasesTable.paymentStatus} = 'completed' THEN ${purchasesTable.platformFee} ELSE 0 END), 0)::float`,
      }).from(purchasesTable),

      db.select({
        totalFees: sql<number>`COALESCE(SUM(${purchasesTable.platformFee}), 0)::float`,
      }).from(purchasesTable).where(
        and(
          gte(purchasesTable.createdAt, monthStart),
          eq(purchasesTable.paymentStatus, "completed"),
        ),
      ),

      db.select({
        total: sql<number>`COALESCE(SUM(${subscriptionPlansTable.price}), 0)::float`,
      }).from(subscriptionsTable)
        .innerJoin(subscriptionPlansTable, eq(subscriptionPlansTable.id, subscriptionsTable.planId)),

      db.select({
        total: sql<number>`COALESCE(SUM(${subscriptionPlansTable.price}), 0)::float`,
      }).from(subscriptionsTable)
        .innerJoin(subscriptionPlansTable, eq(subscriptionPlansTable.id, subscriptionsTable.planId))
        .where(gte(subscriptionsTable.createdAt, monthStart)),

      db.select({
        totalFees: sql<number>`COALESCE(SUM(CAST(${walletTransactionsTable.metadata}->>'escrowFeeAmount' AS numeric)), 0)::float`,
      }).from(walletTransactionsTable).where(
        and(
          eq(walletTransactionsTable.type, "withdrawal"),
          eq(walletTransactionsTable.status, "completed")
        )
      ),

      db.select({
        totalFees: sql<number>`COALESCE(SUM(CAST(${walletTransactionsTable.metadata}->>'escrowFeeAmount' AS numeric)), 0)::float`,
      }).from(walletTransactionsTable).where(
        and(
          eq(walletTransactionsTable.type, "withdrawal"),
          eq(walletTransactionsTable.status, "completed"),
          gte(walletTransactionsTable.updatedAt, monthStart)
        )
      ),
    ]);

    const totalEscrowAndTransactionFees = allPurchases.totalFees + withdrawalFees.totalFees;
    const monthlyEscrowAndTransactionFees = monthPurchases.totalFees + monthWithdrawalFees.totalFees;

    res.json({
      totalEarnings: totalEscrowAndTransactionFees + subRevenue.total,
      monthlyEarnings: monthlyEscrowAndTransactionFees + monthSubRevenue.total,
      subscriptionEarnings: subRevenue.total,
      escrowEarnings: totalEscrowAndTransactionFees,
    });
  } catch (err) {
    console.error("admin finance stats error", err);
    res.status(500).json({ error: "Failed to fetch finance stats" });
  }
});

// GET /admin/finances/escrow-fee
// Returns the configured escrow fee percentage applied to seller withdrawals.
router.get("/admin/finances/escrow-fee", requireAdmin, async (_req: AuthRequest, res) => {
  try {
    const percent = await readEscrowWithdrawalFeePercent();
    res.json({ percent });
  } catch (err) {
    console.error("admin escrow fee get error", err);
    res.status(500).json({ error: "Failed to fetch escrow fee" });
  }
});

// PUT /admin/finances/escrow-fee
// Updates the escrow fee percentage applied to seller withdrawals.
router.put("/admin/finances/escrow-fee", requireAdmin, async (req: AuthRequest, res) => {
  try {
    const raw = (req.body as { percent?: unknown } | undefined)?.percent;
    const percent = Number(raw);
    if (!Number.isFinite(percent) || percent < 0 || percent > MAX_ESCROW_WITHDRAWAL_FEE_PERCENT) {
      res.status(400).json({ error: `Percent must be between 0 and ${MAX_ESCROW_WITHDRAWAL_FEE_PERCENT}` });
      return;
    }

    const now = new Date();
    await db
      .insert(financeSettingsTable)
      .values({
        key: ESCROW_WITHDRAWAL_FEE_KEY,
        value: percent,
        updatedBy: req.user!.userId,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: financeSettingsTable.key,
        set: {
          value: percent,
          updatedBy: req.user!.userId,
          updatedAt: now,
        },
      });

    void writeAuditLog({
      userId: req.user!.userId,
      action: "finance.escrow_fee.updated",
      resourceType: "finance_setting",
      resourceId: null,
      details: { key: ESCROW_WITHDRAWAL_FEE_KEY, percent },
      ipAddress: requestIp(req),
      userAgent: req.headers["user-agent"] ? String(req.headers["user-agent"]) : null,
    }).catch(() => {});

    res.json({ success: true, percent });
  } catch (err) {
    console.error("admin escrow fee update error", err);
    res.status(500).json({ error: "Failed to update escrow fee" });
  }
});

// GET /admin/finances/chart?year=2025
// Returns monthly platform earnings aggregated by month for a given year.
router.get("/admin/finances/chart", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const year = parseInt(String(req.query.year ?? new Date().getFullYear()), 10) || new Date().getFullYear();

    const [purchaseRows, subRows, withdrawalRows] = await Promise.all([
      db
        .select({
          month: sql<number>`EXTRACT(MONTH FROM ${purchasesTable.createdAt})::int`,
          earnings: sql<number>`COALESCE(SUM(${purchasesTable.platformFee}), 0)::float`,
        })
        .from(purchasesTable)
        .where(
          and(
            sql`EXTRACT(YEAR FROM ${purchasesTable.createdAt}) = ${year}`,
            eq(purchasesTable.paymentStatus, "completed"),
          ),
        )
        .groupBy(sql`EXTRACT(MONTH FROM ${purchasesTable.createdAt})`),
      db
        .select({
          month: sql<number>`EXTRACT(MONTH FROM ${subscriptionsTable.createdAt})::int`,
          earnings: sql<number>`COALESCE(SUM(${subscriptionPlansTable.price}), 0)::float`,
        })
        .from(subscriptionsTable)
        .innerJoin(subscriptionPlansTable, eq(subscriptionPlansTable.id, subscriptionsTable.planId))
        .where(sql`EXTRACT(YEAR FROM ${subscriptionsTable.createdAt}) = ${year}`)
        .groupBy(sql`EXTRACT(MONTH FROM ${subscriptionsTable.createdAt})`),
      db
        .select({
          month: sql<number>`EXTRACT(MONTH FROM ${walletTransactionsTable.updatedAt})::int`,
          earnings: sql<number>`COALESCE(SUM(CAST(${walletTransactionsTable.metadata}->>'escrowFeeAmount' AS numeric)), 0)::float`,
        })
        .from(walletTransactionsTable)
        .where(
          and(
            sql`EXTRACT(YEAR FROM ${walletTransactionsTable.updatedAt}) = ${year}`,
            eq(walletTransactionsTable.type, "withdrawal"),
            eq(walletTransactionsTable.status, "completed")
          )
        )
        .groupBy(sql`EXTRACT(MONTH FROM ${walletTransactionsTable.updatedAt})`)
    ]);

    const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const series = MONTHS.map((label, i) => {
      const p = purchaseRows.find((r) => r.month === i + 1)?.earnings ?? 0;
      const s = subRows.find((r) => r.month === i + 1)?.earnings ?? 0;
      const w = withdrawalRows.find((r) => r.month === i + 1)?.earnings ?? 0;
      return { month: label, revenue: p + s + w, fees: p + s + w };
    });

    const total = series.reduce((s, r) => s + r.revenue, 0);

    const [prevPurchaseRows, prevSubRows, prevWithdrawalRows] = await Promise.all([
      db.select({ total: sql<number>`COALESCE(SUM(${purchasesTable.platformFee}), 0)::float` })
        .from(purchasesTable)
        .where(and(sql`EXTRACT(YEAR FROM ${purchasesTable.createdAt}) = ${year - 1}`, eq(purchasesTable.paymentStatus, "completed"))),
      db.select({ total: sql<number>`COALESCE(SUM(${subscriptionPlansTable.price}), 0)::float` })
        .from(subscriptionsTable)
        .innerJoin(subscriptionPlansTable, eq(subscriptionPlansTable.id, subscriptionsTable.planId))
        .where(sql`EXTRACT(YEAR FROM ${subscriptionsTable.createdAt}) = ${year - 1}`),
      db.select({ total: sql<number>`COALESCE(SUM(CAST(${walletTransactionsTable.metadata}->>'escrowFeeAmount' AS numeric)), 0)::float` })
        .from(walletTransactionsTable)
        .where(and(sql`EXTRACT(YEAR FROM ${walletTransactionsTable.updatedAt}) = ${year - 1}`, eq(walletTransactionsTable.type, "withdrawal"), eq(walletTransactionsTable.status, "completed")))
    ]);

    const prevTotal = (prevPurchaseRows[0]?.total ?? 0) + (prevSubRows[0]?.total ?? 0) + (prevWithdrawalRows[0]?.total ?? 0);
    const growthPct = prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : total > 0 ? 100 : 0;

    res.json({ year, total, growthPct, series });
  } catch (err) {
    console.error("admin finance chart error", err);
    res.status(500).json({ error: "Failed to fetch chart data" });
  }
});

// GET /admin/finances/transactions
// Lists all platform transactions (purchases + wallet deposits) with details.
const buyerAlias = alias(usersTable, "buyer");
const sellerAlias = alias(usersTable, "seller");

type WithdrawalMetadata = {
  bankAccountId?: number;
  bankName?: string;
  bankCode?: string;
  accountNumber?: string;
  accountName?: string;
  requestedByUserId?: number;
  requestedAt?: string;
  processing?: boolean;
  approvedByUserId?: number;
  approvedAt?: string;
  rejectedByUserId?: number;
  rejectedAt?: string;
  rejectionReason?: string;
  paystackRecipientCode?: string;
  paystackTransferCode?: string;
  paystackReference?: string;
  paystackStatus?: string;
  paystackFailureReason?: string;
  escrowFeePercent?: number;
  escrowFeeAmount?: number;
  netPayoutAmount?: number;
};

function asWithdrawalMetadata(value: unknown): WithdrawalMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as WithdrawalMetadata;
}

const ESCROW_WITHDRAWAL_FEE_KEY = "escrow_withdrawal_fee_percent";
const DEFAULT_ESCROW_WITHDRAWAL_FEE_PERCENT = 0;
const MAX_ESCROW_WITHDRAWAL_FEE_PERCENT = 100;

async function readEscrowWithdrawalFeePercent() {
  const row = await db
    .select()
    .from(financeSettingsTable)
    .where(eq(financeSettingsTable.key, ESCROW_WITHDRAWAL_FEE_KEY))
    .limit(1)
    .then((r) => r[0]);
  const value = Number(row?.value ?? DEFAULT_ESCROW_WITHDRAWAL_FEE_PERCENT);
  if (!Number.isFinite(value)) return DEFAULT_ESCROW_WITHDRAWAL_FEE_PERCENT;
  return Math.min(MAX_ESCROW_WITHDRAWAL_FEE_PERCENT, Math.max(0, value));
}

function computeEscrowFeeAmounts(grossAmount: number, percent: number) {
  const safeGross = Number.isFinite(grossAmount) ? Math.max(0, grossAmount) : 0;
  const safePercent = Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0;
  const feeAmount = Math.round(safeGross * (safePercent / 100));
  const netAmount = Math.max(0, safeGross - feeAmount);
  return { feeAmount, netAmount };
}

router.get("/admin/finances/transactions", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const search = String(req.query.search ?? "").trim();
    const status = String(req.query.status ?? "all").trim();
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize ?? "10"), 10) || 10));

    const conds: SQL[] = [];
    if (status === "paid") {
      conds.push(eq(purchasesTable.paymentStatus, "completed"));
    } else if (status === "escrow") {
      conds.push(sql`${purchasesTable.paymentStatus} IN ('pending', 'in_escrow')`);
    }
    if (search) {
      conds.push(
        or(
          ilike(listingsTable.make, `%${search}%`),
          ilike(listingsTable.model, `%${search}%`),
          ilike(buyerAlias.firstName, `%${search}%`),
          ilike(buyerAlias.lastName, `%${search}%`),
          ilike(sellerAlias.firstName, `%${search}%`),
          ilike(sellerAlias.lastName, `%${search}%`),
        )!,
      );
    }
    const where = conds.length > 0 ? and(...conds) : undefined;

    const rows = await db
      .select({
        id: purchasesTable.id,
        amount: purchasesTable.amount,
        platformFee: purchasesTable.platformFee,
        paymentStatus: purchasesTable.paymentStatus,
        receiptNumber: purchasesTable.receiptNumber,
        createdAt: purchasesTable.createdAt,
        listingMake: listingsTable.make,
        listingModel: listingsTable.model,
        listingYear: listingsTable.year,
        buyerFirstName: buyerAlias.firstName,
        buyerLastName: buyerAlias.lastName,
        sellerFirstName: sellerAlias.firstName,
        sellerLastName: sellerAlias.lastName,
      })
      .from(purchasesTable)
      .innerJoin(listingsTable, eq(listingsTable.id, purchasesTable.listingId))
      .innerJoin(buyerAlias, eq(buyerAlias.id, purchasesTable.buyerId))
      .innerJoin(sellerAlias, eq(sellerAlias.id, purchasesTable.sellerId))
      .where(where)
      .orderBy(desc(purchasesTable.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const [{ c: total }] = await db
      .select({ c: count() })
      .from(purchasesTable)
      .innerJoin(listingsTable, eq(listingsTable.id, purchasesTable.listingId))
      .innerJoin(buyerAlias, eq(buyerAlias.id, purchasesTable.buyerId))
      .innerJoin(sellerAlias, eq(sellerAlias.id, purchasesTable.sellerId))
      .where(where);

    res.json({ items: rows, total: Number(total), page, pageSize });
  } catch (err) {
    console.error("admin finance transactions error", err);
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
});

// GET /admin/finances/transactions/:id/receipt
// Returns a single transaction's details for download.
router.get("/admin/finances/transactions/:id/receipt", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid transaction id" });
      return;
    }

    const row = await db
      .select({
        id: purchasesTable.id,
        amount: purchasesTable.amount,
        platformFee: purchasesTable.platformFee,
        sellerPayout: purchasesTable.sellerPayout,
        paymentStatus: purchasesTable.paymentStatus,
        paymentMethod: purchasesTable.paymentMethod,
        receiptNumber: purchasesTable.receiptNumber,
        createdAt: purchasesTable.createdAt,
        listingMake: listingsTable.make,
        listingModel: listingsTable.model,
        listingYear: listingsTable.year,
        buyerFirstName: buyerAlias.firstName,
        buyerLastName: buyerAlias.lastName,
        buyerEmail: buyerAlias.email,
        sellerFirstName: sellerAlias.firstName,
        sellerLastName: sellerAlias.lastName,
        sellerEmail: sellerAlias.email,
      })
      .from(purchasesTable)
      .innerJoin(listingsTable, eq(listingsTable.id, purchasesTable.listingId))
      .innerJoin(buyerAlias, eq(buyerAlias.id, purchasesTable.buyerId))
      .innerJoin(sellerAlias, eq(sellerAlias.id, purchasesTable.sellerId))
      .where(eq(purchasesTable.id, id))
      .limit(1)
      .then((r) => r[0]);

    if (!row) {
      res.status(404).json({ error: "Transaction not found" });
      return;
    }

    res.json({ transaction: row });
  } catch (err) {
    console.error("admin finance receipt error", err);
    res.status(500).json({ error: "Failed to fetch receipt" });
  }
});

// GET /admin/finances/withdrawals
// Lists wallet withdrawal requests for admin review/processing.
router.get("/admin/finances/withdrawals", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const search = String(req.query.search ?? "").trim();
    const status = String(req.query.status ?? "all").trim();
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize ?? "10"), 10) || 10));

    const conds: SQL[] = [eq(walletTransactionsTable.type, "withdrawal")];
    if (status !== "all") {
      const validStatus = ["pending", "completed", "failed", "reversed"] as const;
      if (validStatus.includes(status as (typeof validStatus)[number])) {
        conds.push(
          eq(
            walletTransactionsTable.status,
            status as (typeof validStatus)[number],
          ),
        );
      }
    }
    if (search) {
      conds.push(
        or(
          ilike(usersTable.firstName, `%${search}%`),
          ilike(usersTable.lastName, `%${search}%`),
          ilike(usersTable.email, `%${search}%`),
          ilike(walletTransactionsTable.reference, `%${search}%`),
          ilike(walletTransactionsTable.description, `%${search}%`),
        )!,
      );
    }
    const where = conds.length > 0 ? and(...conds) : undefined;

    const rows = await db
      .select({
        id: walletTransactionsTable.id,
        amount: walletTransactionsTable.amount,
        status: walletTransactionsTable.status,
        reference: walletTransactionsTable.reference,
        description: walletTransactionsTable.description,
        balanceBefore: walletTransactionsTable.balanceBefore,
        balanceAfter: walletTransactionsTable.balanceAfter,
        metadata: walletTransactionsTable.metadata,
        createdAt: walletTransactionsTable.createdAt,
        updatedAt: walletTransactionsTable.updatedAt,
        walletId: walletTransactionsTable.walletId,
        userId: usersTable.id,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        email: usersTable.email,
      })
      .from(walletTransactionsTable)
      .innerJoin(walletAccountsTable, eq(walletAccountsTable.id, walletTransactionsTable.walletId))
      .innerJoin(usersTable, eq(usersTable.id, walletAccountsTable.userId))
      .where(where)
      .orderBy(desc(walletTransactionsTable.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const [{ c: total }] = await db
      .select({ c: count() })
      .from(walletTransactionsTable)
      .innerJoin(walletAccountsTable, eq(walletAccountsTable.id, walletTransactionsTable.walletId))
      .innerJoin(usersTable, eq(usersTable.id, walletAccountsTable.userId))
      .where(where);

    const items = rows.map((r) => {
      const meta = asWithdrawalMetadata(r.metadata);
      return {
        id: r.id,
        amount: r.amount,
        escrowFeePercent: meta.escrowFeePercent ?? 0,
        escrowFeeAmount: meta.escrowFeeAmount ?? 0,
        netPayoutAmount: meta.netPayoutAmount ?? Number(r.amount ?? 0),
        status: r.status,
        reference: r.reference,
        description: r.description,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        balanceBefore: r.balanceBefore,
        balanceAfter: r.balanceAfter,
        user: {
          id: r.userId,
          firstName: r.firstName,
          lastName: r.lastName,
          email: r.email,
        },
        destination: {
          bankName: meta.bankName ?? null,
          bankCode: meta.bankCode ?? null,
          accountName: meta.accountName ?? null,
          accountNumberMasked:
            typeof meta.accountNumber === "string" && meta.accountNumber.length >= 4
              ? `****${meta.accountNumber.slice(-4)}`
              : null,
        },
        approval: {
          processing: Boolean(meta.processing),
          approvedByUserId: meta.approvedByUserId ?? null,
          approvedAt: meta.approvedAt ?? null,
          rejectedByUserId: meta.rejectedByUserId ?? null,
          rejectedAt: meta.rejectedAt ?? null,
          rejectionReason: meta.rejectionReason ?? null,
        },
        transfer: {
          recipientCode: meta.paystackRecipientCode ?? null,
          transferCode: meta.paystackTransferCode ?? null,
          reference: meta.paystackReference ?? null,
          status: meta.paystackStatus ?? null,
          failureReason: meta.paystackFailureReason ?? null,
        },
      };
    });

    res.json({ items, total: Number(total), page, pageSize });
  } catch (err) {
    console.error("admin finance withdrawals list error", err);
    res.status(500).json({ error: "Failed to fetch withdrawals" });
  }
});

// POST /admin/finances/withdrawals/:id/approve
// Approves a pending withdrawal and initiates Paystack transfer.
router.post("/admin/finances/withdrawals/:id/approve", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid withdrawal id" });
    return;
  }

  const adminId = req.user!.userId;
  const nowIso = new Date().toISOString();

  try {
    const escrowFeePercent = await readEscrowWithdrawalFeePercent();

    const reserved = await db.transaction(async (tx) => {
      const txRows = await tx
        .select()
        .from(walletTransactionsTable)
        .where(eq(walletTransactionsTable.id, id))
        .for("update");
      const withdrawal = txRows[0];
      if (!withdrawal || withdrawal.type !== "withdrawal") {
        return { error: "Withdrawal request not found" as const, status: 404 };
      }
      if (withdrawal.status !== "pending") {
        return { error: "Withdrawal is no longer pending" as const, status: 409 };
      }

      const meta = asWithdrawalMetadata(withdrawal.metadata);
      if (meta.processing) {
        return { error: "Withdrawal is already being processed" as const, status: 409 };
      }

      if (!meta.bankCode || !meta.accountNumber || !meta.accountName) {
        return { error: "Withdrawal destination details are incomplete" as const, status: 400 };
      }

      const walletRows = await tx
        .select()
        .from(walletAccountsTable)
        .where(eq(walletAccountsTable.id, withdrawal.walletId))
        .for("update");
      const wallet = walletRows[0];
      if (!wallet) {
        return { error: "Wallet account not found" as const, status: 404 };
      }

      const [owner] = await tx
        .select({ role: usersTable.role })
        .from(usersTable)
        .where(eq(usersTable.id, wallet.userId))
        .limit(1);
      const isSeller = owner?.role === "seller";

      if ((Number(wallet.balance) || 0) < (Number(withdrawal.amount) || 0)) {
        const failedMeta: WithdrawalMetadata = {
          ...meta,
          processing: false,
          approvedByUserId: adminId,
          approvedAt: nowIso,
          paystackFailureReason: "Insufficient wallet balance at approval time",
        };
        await tx
          .update(walletTransactionsTable)
          .set({
            status: "failed",
            metadata: failedMeta as Record<string, unknown>,
            updatedAt: new Date(),
          })
          .where(eq(walletTransactionsTable.id, withdrawal.id));
        return { error: "Insufficient wallet balance at approval time" as const, status: 409 };
      }

      const before = Number(wallet.balance) || 0;
      const amount = Number(withdrawal.amount) || 0;
      const after = before - amount;

      const { feeAmount, netAmount } = isSeller
        ? computeEscrowFeeAmounts(amount, escrowFeePercent)
        : { feeAmount: 0, netAmount: amount };

      // If admin set an extreme fee (e.g., 100%), block approval so we don't
      // attempt a zero-value transfer while still debiting the wallet.
      if (amount > 0 && netAmount <= 0) {
        return { error: "Escrow fee results in zero payout amount" as const, status: 400 };
      }

      await tx
        .update(walletAccountsTable)
        .set({
          balance: after,
          updatedAt: new Date(),
        })
        .where(eq(walletAccountsTable.id, wallet.id));

      const updatedMeta: WithdrawalMetadata = {
        ...meta,
        processing: true,
        approvedByUserId: adminId,
        approvedAt: nowIso,
        escrowFeePercent: isSeller ? escrowFeePercent : 0,
        escrowFeeAmount: feeAmount,
        netPayoutAmount: netAmount,
      };
      await tx
        .update(walletTransactionsTable)
        .set({
          balanceBefore: before,
          balanceAfter: after,
          metadata: updatedMeta as Record<string, unknown>,
          updatedAt: new Date(),
        })
        .where(eq(walletTransactionsTable.id, withdrawal.id));

      return {
        ok: true as const,
        withdrawalId: withdrawal.id,
        walletId: wallet.id,
        amount,
        payoutAmount: netAmount,
        reason: withdrawal.description ?? undefined,
        meta: updatedMeta,
        transferReference: `${withdrawal.reference ?? `WDR-${withdrawal.id}`}-TRF`,
      };
    });

    if ("error" in reserved) {
      const errStatus =
        typeof reserved.status === "number" ? reserved.status : 500;
      res.status(errStatus).json({ error: reserved.error });
      return;
    }

    let recipientCode = reserved.meta.paystackRecipientCode;
    if (!recipientCode) {
      const recipient = await createTransferRecipient({
        name: reserved.meta.accountName ?? "Huce Autos User",
        accountNumber: reserved.meta.accountNumber ?? "",
        bankCode: reserved.meta.bankCode ?? "",
        currency: "NGN",
      });
      recipientCode = recipient.recipient_code;
    }
    if (!recipientCode) {
      throw new Error("Missing transfer recipient code");
    }

    const transfer = await initiateTransfer({
      amountNaira: reserved.payoutAmount,
      recipientCode,
      reason: reserved.reason ?? "Wallet withdrawal payout",
      reference: reserved.transferReference,
    });

    await db
      .update(walletTransactionsTable)
      .set({
        status: "completed",
        metadata: {
          ...reserved.meta,
          processing: false,
          approvedByUserId: adminId,
          approvedAt: nowIso,
          paystackRecipientCode: recipientCode,
          paystackTransferCode: transfer.transfer_code,
          paystackReference: transfer.reference,
          paystackStatus: transfer.status,
          paystackFailureReason: null,
        },
        updatedAt: new Date(),
      })
      .where(eq(walletTransactionsTable.id, reserved.withdrawalId));

    res.json({
      success: true,
      withdrawalId: reserved.withdrawalId,
      transfer: {
        reference: transfer.reference,
        transferCode: transfer.transfer_code,
        status: transfer.status,
      },
    });
  } catch (err) {
    console.error("admin approve withdrawal error", err);

    try {
      await db.transaction(async (tx) => {
        const txRows = await tx
          .select()
          .from(walletTransactionsTable)
          .where(eq(walletTransactionsTable.id, id))
          .for("update");
        const withdrawal = txRows[0];
        if (!withdrawal || withdrawal.type !== "withdrawal") return;
        if (withdrawal.status !== "pending") return;

        const meta = asWithdrawalMetadata(withdrawal.metadata);
        if (!meta.processing) return;

        const walletRows = await tx
          .select()
          .from(walletAccountsTable)
          .where(eq(walletAccountsTable.id, withdrawal.walletId))
          .for("update");
        const wallet = walletRows[0];
        if (!wallet) return;

        await tx
          .update(walletAccountsTable)
          .set({
            balance: sql`${walletAccountsTable.balance} + ${withdrawal.amount}`,
            updatedAt: new Date(),
          })
          .where(eq(walletAccountsTable.id, wallet.id));

        await tx
          .update(walletTransactionsTable)
          .set({
            status: "failed",
            metadata: {
              ...meta,
              processing: false,
              approvedByUserId: adminId,
              approvedAt: nowIso,
              paystackFailureReason:
                err instanceof Error ? err.message : "Failed to initiate transfer",
            },
            updatedAt: new Date(),
          })
          .where(eq(walletTransactionsTable.id, withdrawal.id));
      });
    } catch (rollbackErr) {
      console.error("admin approve withdrawal rollback error", rollbackErr);
    }

    res.status(500).json({ error: "Failed to approve withdrawal" });
  }
});

// POST /admin/finances/withdrawals/:id/reject
// Rejects a pending withdrawal request without wallet debit.
router.post("/admin/finances/withdrawals/:id/reject", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid withdrawal id" });
      return;
    }
    const reasonRaw = (req.body as { reason?: unknown } | undefined)?.reason;
    const reason = typeof reasonRaw === "string" ? reasonRaw.trim() : "";
    if (!reason) {
      res.status(400).json({ error: "Rejection reason is required" });
      return;
    }

    const adminId = req.user!.userId;
    const nowIso = new Date().toISOString();

    const outcome = await db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(walletTransactionsTable)
        .where(eq(walletTransactionsTable.id, id))
        .for("update");
      const withdrawal = rows[0];
      if (!withdrawal || withdrawal.type !== "withdrawal") {
        return { error: "Withdrawal request not found" as const, status: 404 };
      }
      if (withdrawal.status !== "pending") {
        return { error: "Withdrawal is no longer pending" as const, status: 409 };
      }

      const meta = asWithdrawalMetadata(withdrawal.metadata);
      if (meta.processing) {
        return { error: "Withdrawal is already being processed" as const, status: 409 };
      }

      await tx
        .update(walletTransactionsTable)
        .set({
          status: "reversed",
          metadata: {
            ...meta,
            rejectedByUserId: adminId,
            rejectedAt: nowIso,
            rejectionReason: reason,
            processing: false,
          },
          updatedAt: new Date(),
        })
        .where(eq(walletTransactionsTable.id, withdrawal.id));

      return { ok: true as const };
    });

    if (!("ok" in outcome)) {
      res.status(outcome.status).json({ error: outcome.error });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    console.error("admin reject withdrawal error", err);
    res.status(500).json({ error: "Failed to reject withdrawal" });
  }
});

// ─── Admin Support Endpoints ─────────────────────────────────────────────────

const assignedRepAlias = alias(usersTable, "assigned_rep");

// GET /admin/support/tickets
// Lists all support tickets across every user with customer + rep info.
router.get("/admin/support/tickets", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const status = String(req.query.status ?? "all").trim();
    const search = String(req.query.search ?? "").trim();
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize ?? "20"), 10) || 20));

    const conds: SQL[] = [];
    if (status === "open") {
      conds.push(sql`${supportTicketsTable.status} NOT IN ('resolved', 'closed')`);
    } else if (status === "closed") {
      conds.push(sql`${supportTicketsTable.status} IN ('resolved', 'closed')`);
    }
    if (search) {
      conds.push(
        or(
          ilike(supportTicketsTable.subject, `%${search}%`),
          ilike(supportTicketsTable.category, `%${search}%`),
          ilike(usersTable.firstName, `%${search}%`),
          ilike(usersTable.lastName, `%${search}%`),
        )!,
      );
    }
    const where = conds.length > 0 ? and(...conds) : undefined;

    const rows = await db
      .select({
        id: supportTicketsTable.id,
        subject: supportTicketsTable.subject,
        category: supportTicketsTable.category,
        status: supportTicketsTable.status,
        priority: supportTicketsTable.priority,
        createdAt: supportTicketsTable.createdAt,
        updatedAt: supportTicketsTable.updatedAt,
        resolvedAt: supportTicketsTable.resolvedAt,
        customerFirstName: usersTable.firstName,
        customerLastName: usersTable.lastName,
        assignedRepFirstName: assignedRepAlias.firstName,
        assignedRepLastName: assignedRepAlias.lastName,
        lastResponseAt: sql<Date | null>`(
          SELECT MAX(${supportTicketMessagesTable.createdAt})
          FROM ${supportTicketMessagesTable}
          WHERE ${supportTicketMessagesTable.ticketId} = ${supportTicketsTable.id}
        )`,
      })
      .from(supportTicketsTable)
      .innerJoin(usersTable, eq(usersTable.id, supportTicketsTable.userId))
      .leftJoin(assignedRepAlias, eq(assignedRepAlias.id, supportTicketsTable.assignedTo))
      .where(where)
      .orderBy(desc(supportTicketsTable.updatedAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const [{ c: total }] = await db
      .select({ c: count() })
      .from(supportTicketsTable)
      .innerJoin(usersTable, eq(usersTable.id, supportTicketsTable.userId))
      .where(where);

    res.json({ items: rows, total: Number(total), page, pageSize });
  } catch (err) {
    console.error("admin support tickets list error", err);
    res.status(500).json({ error: "Failed to fetch support tickets" });
  }
});

// GET /admin/support/tickets/:id
// Returns a single ticket with all messages and customer info.
router.get("/admin/support/tickets/:id", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid ticket id" });
      return;
    }

    const ticket = await db
      .select({
        id: supportTicketsTable.id,
        subject: supportTicketsTable.subject,
        category: supportTicketsTable.category,
        status: supportTicketsTable.status,
        priority: supportTicketsTable.priority,
        assignedTo: supportTicketsTable.assignedTo,
        createdAt: supportTicketsTable.createdAt,
        updatedAt: supportTicketsTable.updatedAt,
        resolvedAt: supportTicketsTable.resolvedAt,
        userId: supportTicketsTable.userId,
        customerFirstName: usersTable.firstName,
        customerLastName: usersTable.lastName,
        customerEmail: usersTable.email,
      })
      .from(supportTicketsTable)
      .innerJoin(usersTable, eq(usersTable.id, supportTicketsTable.userId))
      .where(eq(supportTicketsTable.id, id))
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

    res.json({ ticket, messages });
  } catch (err) {
    console.error("admin support ticket detail error", err);
    res.status(500).json({ error: "Failed to load ticket" });
  }
});

// POST /admin/support/tickets/:id/messages
// Admin replies to a ticket; marks isStaffReply=true and moves status to in_progress.
router.post("/admin/support/tickets/:id/messages", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid ticket id" });
      return;
    }

    const { content } = req.body as { content?: string };
    if (!content || !content.trim()) {
      res.status(400).json({ error: "Message content is required" });
      return;
    }

    const ticket = await db
      .select()
      .from(supportTicketsTable)
      .where(eq(supportTicketsTable.id, id))
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
        isStaffReply: true,
      })
      .returning();

    await db
      .update(supportTicketsTable)
      .set({
        updatedAt: new Date(),
        status: ticket.status === "open" ? "in_progress" : ticket.status,
        assignedTo: ticket.assignedTo ?? req.user!.userId,
      })
      .where(eq(supportTicketsTable.id, id));

    res.status(201).json({ message });
  } catch (err) {
    console.error("admin support ticket reply error", err);
    res.status(500).json({ error: "Failed to send reply" });
  }
});

// PATCH /admin/support/tickets/:id
// Admin closes or updates status/priority/assignedTo of a ticket.
router.patch("/admin/support/tickets/:id", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid ticket id" });
      return;
    }

    const VALID_STATUSES = ["open", "in_progress", "resolved", "closed"] as const;
    const VALID_PRIORITIES = ["low", "medium", "high", "urgent"] as const;

    const { status, priority, assignedTo } = req.body as {
      status?: string;
      priority?: string;
      assignedTo?: number;
    };

    const update: Record<string, unknown> = { updatedAt: new Date() };

    if (status !== undefined) {
      if (!(VALID_STATUSES as readonly string[]).includes(status)) {
        res.status(400).json({ error: "Invalid status" });
        return;
      }
      update.status = status;
      update.resolvedAt =
        status === "resolved" || status === "closed" ? new Date() : null;
    }
    if (priority !== undefined) {
      if (!(VALID_PRIORITIES as readonly string[]).includes(priority)) {
        res.status(400).json({ error: "Invalid priority" });
        return;
      }
      update.priority = priority;
    }
    if (assignedTo !== undefined) {
      update.assignedTo = assignedTo;
    }

    const [ticket] = await db
      .update(supportTicketsTable)
      .set(update as any)
      .where(eq(supportTicketsTable.id, id))
      .returning();

    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    res.json({ ticket });
  } catch (err) {
    console.error("admin support ticket update error", err);
    res.status(500).json({ error: "Failed to update ticket" });
  }
});

// ─── Admin CMS News Endpoints ─────────────────────────────────────────────────

router.get("/admin/audit-log", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const search = String(req.query.search ?? "").trim().toLowerCase();
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(String(req.query.pageSize ?? "10"), 10) || 10),
    );

    const baseQuery = db
      .select({
        id: auditLogsTable.id,
        userId: auditLogsTable.userId,
        userFirstName: usersTable.firstName,
        userLastName: usersTable.lastName,
        action: auditLogsTable.action,
        details: auditLogsTable.details,
        ipAddress: auditLogsTable.ipAddress,
        createdAt: auditLogsTable.createdAt,
      })
      .from(auditLogsTable)
      .leftJoin(usersTable, eq(usersTable.id, auditLogsTable.userId));

    // Keep the admin audit feed focused on meaningful user/admin actions.
    // System telemetry (e.g. ad impressions) and anonymous system records are excluded.
    const userActivityWhere = and(
      sql`${auditLogsTable.userId} IS NOT NULL`,
      ne(auditLogsTable.action, "ad_impression"),
    );
    const searchWhere = search
      ? or(
          ilike(auditLogsTable.action, `%${search}%`),
          ilike(auditLogsTable.ipAddress, `%${search}%`),
          sql`CAST(${auditLogsTable.details} AS text) ILIKE ${`%${search}%`}`,
        )
      : undefined;
    const where = searchWhere ? and(userActivityWhere, searchWhere) : userActivityWhere;

    const [items, totals] = await Promise.all([
      baseQuery
        .where(where)
        .orderBy(desc(auditLogsTable.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db.select({ c: count() }).from(auditLogsTable).where(where),
    ]);

    res.json({
      items: items.map((row) => ({
        ...row,
        userName:
          row.userFirstName || row.userLastName
            ? `${row.userFirstName ?? ""} ${row.userLastName ?? ""}`.trim()
            : null,
      })),
      total: Number(totals[0]?.c ?? 0),
      page,
      pageSize,
    });
  } catch (err) {
    console.error("admin audit log list error", err);
    res.status(500).json({ error: "Failed to fetch audit logs" });
  }
});

// ─── Admin CMS Banner & Ads Endpoints ─────────────────────────────────────────
router.get("/admin/banners", requireAdmin, async (_req: AuthRequest, res): Promise<any> => {
  try {
    const rows = await db
      .select({
        id: cmsBannersTable.id,
        title: cmsBannersTable.title,
        imageUrl: cmsBannersTable.imageUrl,
        linkUrl: cmsBannersTable.linkUrl,
        position: cmsBannersTable.position,
        isActive: cmsBannersTable.isActive,
        startsAt: cmsBannersTable.startsAt,
        endsAt: cmsBannersTable.endsAt,
        createdAt: cmsBannersTable.createdAt,
        updatedAt: cmsBannersTable.updatedAt,
      })
      .from(cmsBannersTable)
      .orderBy(desc(cmsBannersTable.createdAt))
      .limit(200);

    const ids = rows.map((r) => r.id);
    const impressionCounts = ids.length
      ? await db
          .select({
            resourceId: auditLogsTable.resourceId,
            total: count(),
          })
          .from(auditLogsTable)
          .where(
            and(
              inArray(auditLogsTable.resourceId, ids),
              eq(auditLogsTable.resourceType, "cms_banner"),
              eq(auditLogsTable.action, "ad_impression"),
            ),
          )
          .groupBy(auditLogsTable.resourceId)
      : [];
    const impressionMap = new Map(
      impressionCounts.map((r) => [Number(r.resourceId), Number(r.total ?? 0)]),
    );

    res.json({
      items: rows.map((row) => ({
        ...row,
        imageUrl: normalizeListingImageUrl(row.imageUrl),
        impressionCount: impressionMap.get(row.id) ?? 0,
      })),
    });
  } catch (err) {
    console.error("admin banners list error", err);
    res.status(500).json({ error: "Failed to fetch banners" });
  }
});

router.post("/admin/banners", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const {
      title,
      imageUrl,
      linkUrl,
      position,
      isActive,
      startsAt,
      endsAt,
    } = req.body as {
      title?: string;
      imageUrl?: string;
      linkUrl?: string | null;
      position?: string;
      isActive?: boolean;
      startsAt?: string | null;
      endsAt?: string | null;
    };

    const cleanTitle = String(title ?? "").trim();
    const cleanImageUrl = String(imageUrl ?? "").trim();
    const cleanPosition = String(position ?? "").trim();
    const cleanLinkUrl = linkUrl ? String(linkUrl).trim() : null;

    if (!cleanTitle || !cleanImageUrl || !cleanPosition) {
      return res.status(400).json({ error: "Title, image and placement are required" });
    }

    const [created] = await db
      .insert(cmsBannersTable)
      .values({
        title: cleanTitle,
        imageUrl: cleanImageUrl,
        linkUrl: cleanLinkUrl,
        position: cleanPosition,
        isActive: isActive ?? true,
        startsAt: startsAt ? new Date(startsAt) : null,
        endsAt: endsAt ? new Date(endsAt) : null,
      })
      .returning();

    return res.status(201).json({
      banner: {
        ...created,
        imageUrl: normalizeListingImageUrl(created.imageUrl),
      },
    });
  } catch (err) {
    console.error("admin banner create error", err);
    return res.status(500).json({ error: "Failed to create banner" });
  }
});

router.patch("/admin/banners/:id", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "Invalid banner id" });
    }

    const body = req.body as {
      title?: string;
      imageUrl?: string;
      linkUrl?: string | null;
      position?: string;
      isActive?: boolean;
      startsAt?: string | null;
      endsAt?: string | null;
    };

    const updates: Partial<typeof cmsBannersTable.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (body.title !== undefined) {
      const t = String(body.title).trim();
      if (!t) return res.status(400).json({ error: "Title cannot be empty" });
      updates.title = t;
    }
    if (body.imageUrl !== undefined) {
      const url = String(body.imageUrl).trim();
      if (!url) return res.status(400).json({ error: "Image URL cannot be empty" });
      updates.imageUrl = url;
    }
    if (body.linkUrl !== undefined) {
      updates.linkUrl = body.linkUrl ? String(body.linkUrl).trim() : null;
    }
    if (body.position !== undefined) {
      const p = String(body.position).trim();
      if (!p) return res.status(400).json({ error: "Placement cannot be empty" });
      updates.position = p;
    }
    if (body.isActive !== undefined) {
      updates.isActive = !!body.isActive;
    }
    if (body.startsAt !== undefined) {
      updates.startsAt = body.startsAt ? new Date(body.startsAt) : null;
    }
    if (body.endsAt !== undefined) {
      updates.endsAt = body.endsAt ? new Date(body.endsAt) : null;
    }

    const [updated] = await db
      .update(cmsBannersTable)
      .set(updates)
      .where(eq(cmsBannersTable.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Banner not found" });
    }

    return res.json({
      banner: {
        ...updated,
        imageUrl: normalizeListingImageUrl(updated.imageUrl),
      },
    });
  } catch (err) {
    console.error("admin banner update error", err);
    return res.status(500).json({ error: "Failed to update banner" });
  }
});

router.delete("/admin/banners/:id", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "Invalid banner id" });
    }
    const [deleted] = await db
      .delete(cmsBannersTable)
      .where(eq(cmsBannersTable.id, id))
      .returning({ id: cmsBannersTable.id });
    if (!deleted) {
      return res.status(404).json({ error: "Banner not found" });
    }
    return res.json({ success: true });
  } catch (err) {
    console.error("admin banner delete error", err);
    return res.status(500).json({ error: "Failed to delete banner" });
  }
});

router.get("/admin/app-reviews", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    await ensureAppReviewSchema();
    const status = String(req.query.status ?? "all").trim();
    const search = String(req.query.search ?? "").trim();
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? "10"), 10) || 10));
    const offset = (page - 1) * limit;

    const where: SQL[] = [];
    if (status === "pending" || status === "approved" || status === "rejected") {
      where.push(eq(testimonialsTable.status, status));
    }
    if (search) {
      where.push(
        or(
          ilike(testimonialsTable.title, `%${search}%`),
          ilike(testimonialsTable.comment, `%${search}%`),
          ilike(usersTable.firstName, `%${search}%`),
          ilike(usersTable.lastName, `%${search}%`),
          ilike(usersTable.email, `%${search}%`),
        )!,
      );
    }
    const whereClause = where.length ? and(...where) : undefined;

    const rows = await db
      .select({
        id: testimonialsTable.id,
        userId: testimonialsTable.userId,
        role: testimonialsTable.role,
        rating: testimonialsTable.rating,
        title: testimonialsTable.title,
        comment: testimonialsTable.comment,
        status: testimonialsTable.status,
        adminNote: testimonialsTable.adminNote,
        createdAt: testimonialsTable.createdAt,
        updatedAt: testimonialsTable.updatedAt,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        email: usersTable.email,
      })
      .from(testimonialsTable)
      .innerJoin(usersTable, eq(usersTable.id, testimonialsTable.userId))
      .where(whereClause)
      .orderBy(desc(testimonialsTable.createdAt), desc(testimonialsTable.id))
      .limit(limit)
      .offset(offset);

    const [totalRow] = await db
      .select({ total: count() })
      .from(testimonialsTable)
      .innerJoin(usersTable, eq(usersTable.id, testimonialsTable.userId))
      .where(whereClause);

    const total = Number(totalRow?.total ?? 0);
    return res.json({
      items: rows.map((r) => ({
        ...r,
        user: {
          id: r.userId,
          name: `${r.firstName} ${r.lastName}`.trim(),
          email: r.email,
        },
      })),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (err) {
    console.error("admin app reviews list error", err);
    return res.status(500).json({ error: "Failed to fetch app reviews" });
  }
});

router.patch("/admin/app-reviews/:id", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    await ensureAppReviewSchema();
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid review id" });

    const body = req.body as {
      status?: "pending" | "approved" | "rejected";
      adminNote?: string | null;
    };
    const nextStatus = body.status;
    if (!nextStatus || !["pending", "approved", "rejected"].includes(nextStatus)) {
      return res.status(400).json({ error: "A valid status is required" });
    }
    const note = body.adminNote ? String(body.adminNote).trim() : null;

    const patch: Partial<typeof testimonialsTable.$inferInsert> = {
      status: nextStatus,
      adminNote: note,
      updatedAt: new Date(),
      approvedBy: nextStatus === "approved" ? req.user?.userId ?? null : null,
      approvedAt: nextStatus === "approved" ? new Date() : null,
    };

    const [updated] = await db
      .update(testimonialsTable)
      .set(patch)
      .where(eq(testimonialsTable.id, id))
      .returning();
    if (!updated) return res.status(404).json({ error: "App review not found" });

    await writeAuditLog({
      userId: req.user?.userId ?? null,
      action: "admin_testimonial_status_updated",
      resourceType: "app_review",
      resourceId: updated.id,
      details: { status: nextStatus },
      ipAddress: requestIp(req),
      userAgent: req.get("user-agent") || null,
    });

    return res.json({ item: updated });
  } catch (err) {
    console.error("admin app review update error", err);
    return res.status(500).json({ error: "Failed to update app review" });
  }
});

function sanitizeNewsTags(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input
      .map((tag) => String(tag).trim())
      .filter(Boolean);
  }
  if (typeof input === "string") {
    return input
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }
  return [];
}

function parseNewsTags(raw: string | null | undefined): string[] {
  return String(raw ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

// GET /admin/news
router.get("/admin/news", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const search = String(req.query.search ?? "").trim();
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "8"), 10) || 8));
    const offset = (page - 1) * limit;

    const conds: SQL[] = [];
    if (search) {
      conds.push(ilike(cmsNewsTable.title, `%${search}%`));
    }
    const whereClause = conds.length > 0 ? and(...conds) : undefined;

    const [articles, totalResult] = await Promise.all([
      db
        .select({
          id: cmsNewsTable.id,
          title: cmsNewsTable.title,
          excerpt: cmsNewsTable.excerpt,
          tags: cmsNewsTable.tags,
          content: cmsNewsTable.content,
          imageUrl: cmsNewsTable.imageUrl,
          slug: cmsNewsTable.slug,
          status: cmsNewsTable.status,
          authorName: sql<string>`concat(${usersTable.firstName}, ' ', ${usersTable.lastName})`,
          publishedAt: cmsNewsTable.publishedAt,
          createdAt: cmsNewsTable.createdAt,
        })
        .from(cmsNewsTable)
        .leftJoin(usersTable, eq(cmsNewsTable.authorId, usersTable.id))
        .where(whereClause)
        .orderBy(desc(cmsNewsTable.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: count() })
        .from(cmsNewsTable)
        .where(whereClause),
    ]);

    const normalizedArticles = articles.map((article) => ({
      ...article,
      tags: parseNewsTags(article.tags),
      imageUrl: article.imageUrl ? normalizeListingImageUrl(article.imageUrl) : null,
    }));

    res.json({
      articles: normalizedArticles,
      total: totalResult[0]?.total ?? 0,
      page,
      totalPages: Math.ceil((totalResult[0]?.total ?? 0) / limit),
    });
  } catch (err) {
    console.error("admin news list error", err);
    res.status(500).json({ error: "Failed to fetch news" });
  }
});

// GET /admin/news/:id
router.get("/admin/news/:id", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "Invalid article id" });
    }

    const [article] = await db
      .select({
        id: cmsNewsTable.id,
        title: cmsNewsTable.title,
        excerpt: cmsNewsTable.excerpt,
        tags: cmsNewsTable.tags,
        content: cmsNewsTable.content,
        imageUrl: cmsNewsTable.imageUrl,
        slug: cmsNewsTable.slug,
        status: cmsNewsTable.status,
        authorName: sql<string>`concat(${usersTable.firstName}, ' ', ${usersTable.lastName})`,
        publishedAt: cmsNewsTable.publishedAt,
        createdAt: cmsNewsTable.createdAt,
      })
      .from(cmsNewsTable)
      .leftJoin(usersTable, eq(cmsNewsTable.authorId, usersTable.id))
      .where(eq(cmsNewsTable.id, id))
      .limit(1);

    if (!article) {
      return res.status(404).json({ error: "News article not found" });
    }

    res.json({
      ...article,
      tags: parseNewsTags(article.tags),
      imageUrl: article.imageUrl ? normalizeListingImageUrl(article.imageUrl) : null,
    });
  } catch (err) {
    console.error("admin news get error", err);
    res.status(500).json({ error: "Failed to fetch news article" });
  }
});

// POST /admin/news
router.post("/admin/news", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const { title, excerpt, content, imageUrl, status, tags } = req.body as {
      title: string;
      excerpt?: string;
      content: string;
      imageUrl?: string;
      status?: "draft" | "published";
      tags?: string[] | string;
    };

    if (!title || !content) {
      return res.status(400).json({ error: "Title and content are required" });
    }

    let baseSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    let slug = baseSlug;
    let suffix = 1;
    while (true) {
      const [existing] = await db.select({ id: cmsNewsTable.id }).from(cmsNewsTable).where(eq(cmsNewsTable.slug, slug));
      if (!existing) break;
      slug = `${baseSlug}-${suffix++}`;
    }

    const [article] = await db.insert(cmsNewsTable).values({
      title,
      excerpt,
      tags: sanitizeNewsTags(tags).join(", "),
      content,
      imageUrl,
      slug,
      status: status || "published",
      authorId: req.user!.userId,
      publishedAt: status === "published" ? new Date() : undefined,
    }).returning();

    res.json({
      ...article,
      tags: parseNewsTags(article.tags),
      imageUrl: article.imageUrl ? normalizeListingImageUrl(article.imageUrl) : null,
    });
  } catch (err) {
    console.error("admin news create error", err);
    res.status(500).json({ error: "Failed to create news article" });
  }
});

// PATCH /admin/news/:id
router.patch("/admin/news/:id", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "Invalid article id" });
    }

    const { title, excerpt, content, imageUrl, status, tags } = req.body as {
      title?: string;
      excerpt?: string | null;
      content?: string;
      imageUrl?: string | null;
      status?: "draft" | "published";
      tags?: string[] | string;
    };

    const [existing] = await db
      .select({
        id: cmsNewsTable.id,
        status: cmsNewsTable.status,
      })
      .from(cmsNewsTable)
      .where(eq(cmsNewsTable.id, id))
      .limit(1);
    if (!existing) {
      return res.status(404).json({ error: "News article not found" });
    }

    const updates: Partial<typeof cmsNewsTable.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (title !== undefined) {
      if (!title.trim()) {
        return res.status(400).json({ error: "Title cannot be empty" });
      }
      updates.title = title.trim();
    }
    if (excerpt !== undefined) {
      updates.excerpt = excerpt ? excerpt.trim() : null;
    }
    if (content !== undefined) {
      if (!content.trim()) {
        return res.status(400).json({ error: "Content cannot be empty" });
      }
      updates.content = content.trim();
    }
    if (imageUrl !== undefined) {
      updates.imageUrl = imageUrl ? imageUrl.trim() : null;
    }
    if (status !== undefined) {
      updates.status = status;
      if (status === "published" && existing.status !== "published") {
        updates.publishedAt = new Date();
      }
      if (status === "draft") {
        updates.publishedAt = null;
      }
    }
    if (tags !== undefined) {
      updates.tags = sanitizeNewsTags(tags).join(", ");
    }

    const [article] = await db
      .update(cmsNewsTable)
      .set(updates)
      .where(eq(cmsNewsTable.id, id))
      .returning();

    return res.json({
      ...article,
      tags: parseNewsTags(article.tags),
      imageUrl: article.imageUrl ? normalizeListingImageUrl(article.imageUrl) : null,
    });
  } catch (err) {
    console.error("admin news update error", err);
    return res.status(500).json({ error: "Failed to update news article" });
  }
});

// DELETE /admin/news/:id
router.delete("/admin/news/:id", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "Invalid article id" });
    }

    const [deleted] = await db
      .delete(cmsNewsTable)
      .where(eq(cmsNewsTable.id, id))
      .returning({ id: cmsNewsTable.id });

    if (!deleted) {
      return res.status(404).json({ error: "News article not found" });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("admin news delete error", err);
    return res.status(500).json({ error: "Failed to delete news article" });
  }
});

// ─── Admin CMS Push Message Endpoints ─────────────────────────────────────────
router.get("/admin/push-messages", requireAdmin, async (_req: AuthRequest, res): Promise<any> => {
  try {
    const rows = await db
      .select({
        id: pushMessagesTable.id,
        title: pushMessagesTable.title,
        body: pushMessagesTable.body,
        targetRole: pushMessagesTable.targetRole,
        sentAt: pushMessagesTable.sentAt,
        createdAt: pushMessagesTable.createdAt,
      })
      .from(pushMessagesTable)
      .orderBy(desc(pushMessagesTable.createdAt))
      .limit(100);
    res.json({ items: rows });
  } catch (err) {
    console.error("admin push messages list error", err);
    res.status(500).json({ error: "Failed to fetch push messages" });
  }
});

router.post("/admin/push-messages", requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const { title, body, targetRole } = req.body as {
      title?: string;
      body?: string;
      targetRole?: "all" | "buyer" | "seller" | "inspector";
    };
    const cleanTitle = String(title ?? "").trim();
    const cleanBody = String(body ?? "").trim();
    const target = targetRole ?? "all";
    if (!cleanTitle || !cleanBody) {
      return res.status(400).json({ error: "Title and body are required" });
    }
    if (!["all", "buyer", "seller", "inspector"].includes(target)) {
      return res.status(400).json({ error: "Invalid target role" });
    }

    const [created] = await db
      .insert(pushMessagesTable)
      .values({
        title: cleanTitle,
        body: cleanBody,
        targetRole: target,
        authorId: req.user!.userId,
        sentAt: new Date(),
      })
      .returning();

    void createRoleNotifications(target, {
      type: "admin_announcement",
      title: cleanTitle,
      message: cleanBody,
      entityType: "push_message",
      entityId: created.id,
      priority: "high",
      data: { targetRole: target },
    }).catch(() => {});

    return res.status(201).json({ message: created });
  } catch (err) {
    console.error("admin push message create error", err);
    return res.status(500).json({ error: "Failed to send push message" });
  }
});

export default router;
