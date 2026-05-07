import { Router } from "express";
import {
  db,
  listingsTable,
  usersTable,
  listingImagesTable,
  carFeaturesTable,
  carCategoriesTable,
  listingFeatureLinksTable,
  listingDeletionRequestsTable,
  sellerProfilesTable,
  subscriptionPlansTable,
} from "@workspace/db";
import { and, eq, ne, ilike, desc, sql, or } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../lib/auth-middleware";
import { getSellerPlanLimits, countActiveListings } from "../lib/subscription";
import { sendListingPublishedEmail } from "../lib/email";
import { deleteManagedMediaRef } from "../lib/mediaCleanup";

const router = Router();

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

async function assertSeller(userId: number): Promise<boolean> {
  const [u] = await db
    .select({ role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  return !!u && u.role === "seller";
}

async function isSellerAdminVerified(userId: number): Promise<boolean> {
  const [profile] = await db
    .select({ isVerified: sellerProfilesTable.isVerified })
    .from(sellerProfilesTable)
    .where(eq(sellerProfilesTable.userId, userId))
    .limit(1);
  return !!profile?.isVerified;
}

const listingStatusValues = [
  "active",
  "sold",
  "pending",
  "deleted",
  "suspended",
] as const;

const conditionValues = ["new", "used", "certified_pre_owned"] as const;

interface ListingPayload {
  title?: string | null;
  make?: string;
  model?: string;
  year?: number;
  price?: number;
  negotiable?: boolean;
  condition?: (typeof conditionValues)[number];
  location?: string;
  mileage?: number;
  color?: string | null;
  carType?: string | null;
  transmission?: string | null;
  fuelType?: string | null;
  driveType?: string | null;
  doors?: number | null;
  seats?: number | null;
  engineSize?: string | null;
  horsepower?: number | null;
  vin?: string | null;
  description?: string | null;
  status?: (typeof listingStatusValues)[number];
  isFeatured?: boolean;
  images?: { url: string; mediaType?: "image" | "video"; fileName?: string; fileSize?: number }[];
  featureIds?: number[];
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v.trim() : undefined;
}
function asNum(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}
function asInt(v: unknown): number | undefined {
  const n = asNum(v);
  return n === undefined ? undefined : Math.trunc(n);
}
function asBool(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return undefined;
}

function parseListingPayload(
  body: unknown,
  partial: boolean,
): { ok: true; data: ListingPayload } | { ok: false; error: string } {
  if (!body || typeof body !== "object")
    return { ok: false, error: "Invalid body" };
  const b = body as Record<string, unknown>;
  const out: ListingPayload = {};

  const make = asString(b.make);
  const model = asString(b.model);
  const year = asInt(b.year);
  const price = asNum(b.price);
  const location = asString(b.location);

  if (!partial) {
    if (!make) return { ok: false, error: "make is required" };
    if (!model) return { ok: false, error: "model is required" };
    if (year === undefined || year < 1950 || year > new Date().getFullYear() + 1)
      return { ok: false, error: "year is invalid" };
    if (price === undefined || price <= 0)
      return { ok: false, error: "price must be > 0" };
    if (!location) return { ok: false, error: "location is required" };
  }
  if (make !== undefined) out.make = make;
  if (model !== undefined) out.model = model;
  if (year !== undefined) out.year = year;
  if (price !== undefined) out.price = price;
  if (location !== undefined) out.location = location;

  const title = asString(b.title);
  if (title !== undefined) out.title = title || null;

  const cond = asString(b.condition);
  if (cond && (conditionValues as readonly string[]).includes(cond))
    out.condition = cond as (typeof conditionValues)[number];

  const status = asString(b.status);
  if (status && (listingStatusValues as readonly string[]).includes(status))
    out.status = status as (typeof listingStatusValues)[number];

  const negotiable = asBool(b.negotiable);
  if (negotiable !== undefined) out.negotiable = negotiable;

  const isFeatured = asBool(b.isFeatured);
  if (isFeatured !== undefined) out.isFeatured = isFeatured;

  const mileage = asInt(b.mileage);
  if (mileage !== undefined && mileage >= 0) out.mileage = mileage;

  for (const k of [
    "color",
    "carType",
    "transmission",
    "fuelType",
    "driveType",
    "engineSize",
    "vin",
    "description",
  ] as const) {
    const v = asString(b[k]);
    if (v !== undefined) (out as Record<string, unknown>)[k] = v || null;
  }

  for (const k of ["doors", "seats", "horsepower"] as const) {
    const v = asInt(b[k]);
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }

  if (Array.isArray(b.images)) {
    // Only persist URLs the rest of the system can actually load.
    // Browser-only schemes like blob:/data: are previews — we drop them
    // silently so a future real-upload pipeline can swap them out.
    // Accept absolute http(s) URLs *and* internal storage URLs produced by
    // our presigned-upload pipeline (e.g. `/api/storage/objects/<uuid>`)
    // or local fallback storage (e.g. `/api/storage/local/<file>`).
    // Browser-only schemes like blob:/data: are still dropped.
    const isPersistable = (url: string) =>
      /^https?:\/\//i.test(url) ||
      /^\/api\/storage\/(objects|public-objects|local)\//.test(url);
    const imgs = b.images
      .map((entry) => {
        if (typeof entry === "string" && entry.trim() !== "") {
          const url = entry.trim();
          return isPersistable(url) ? { url, mediaType: "image" as const } : null;
        }
        if (entry && typeof entry === "object") {
          const e = entry as Record<string, unknown>;
          const url = asString(e.url);
          if (!url || !isPersistable(url)) return null;
          const mediaType =
            asString(e.mediaType) === "video"
              ? ("video" as const)
              : ("image" as const);
          const fileName = asString(e.fileName);
          const fileSize = asInt(e.fileSize);
          return { url, mediaType, fileName, fileSize };
        }
        return null;
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .slice(0, 20);
    out.images = imgs;
  }

  if (Array.isArray(b.featureIds)) {
    const ids = b.featureIds
      .map((v) => asInt(v))
      .filter((v): v is number => v !== undefined && v > 0)
      .slice(0, 50);
    out.featureIds = ids;
  }

  return { ok: true, data: out };
}

// ─── GET /listings/subscription-plans — public plan catalog ──────────────────
router.get("/listings/subscription-plans", async (_req, res) => {
  try {
    const rows = await db
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
      })
      .from(subscriptionPlansTable)
      .where(eq(subscriptionPlansTable.isActive, true))
      .orderBy(subscriptionPlansTable.price, subscriptionPlansTable.id);
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to fetch subscription plans" });
  }
});

// ─── GET /listings/categories — public category list ─────────────────────────
router.get("/listings/categories", async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(carCategoriesTable)
      .where(eq(carCategoriesTable.isActive, true))
      .orderBy(carCategoriesTable.name);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});

// ─── GET /listings/features — grouped feature catalog ───────────────────────
router.get("/listings/features", async (_req, res) => {
  try {
    const rows = await db
      .select({
        id: carFeaturesTable.id,
        name: carFeaturesTable.name,
        featureGroup: carFeaturesTable.featureGroup,
      })
      .from(carFeaturesTable)
      .orderBy(carFeaturesTable.featureGroup, carFeaturesTable.name);
    const groups: Record<string, { id: number; name: string }[]> = {};
    for (const r of rows) {
      const g = r.featureGroup ?? "Other";
      if (!groups[g]) groups[g] = [];
      groups[g].push({ id: r.id, name: r.name });
    }
    res.json({ groups });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch features" });
  }
});

// ─── GET /listings/me — seller's own listings ────────────────────────────────
router.get("/listings/me", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    if (!(await assertSeller(userId))) {
      res.status(403).json({ error: "Not a seller account" });
      return;
    }
    if (!(await isSellerAdminVerified(userId))) {
      res.status(403).json({
        error: "Seller is unverified. Admin approval is required before listing cars.",
        code: "SELLER_NOT_VERIFIED",
      });
      return;
    }

    const status = String(req.query.status ?? "active");
    const search = String(req.query.search ?? "").trim();
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(String(req.query.pageSize ?? "10"), 10) || 10),
    );

    const conds = [eq(listingsTable.sellerId, userId)];
    if (status === "all") {
      conds.push(ne(listingsTable.status, "deleted"));
    } else if ((listingStatusValues as readonly string[]).includes(status)) {
      conds.push(
        eq(
          listingsTable.status,
          status as (typeof listingStatusValues)[number],
        ),
      );
    } else {
      conds.push(eq(listingsTable.status, "active"));
    }
    if (search) {
      const like = `%${search}%`;
      const idMatch = /^\d+$/.test(search)
        ? eq(listingsTable.id, parseInt(search, 10))
        : undefined;
      const searchClause = or(
        ilike(listingsTable.make, like),
        ilike(listingsTable.model, like),
        ilike(listingsTable.title, like),
        ...(idMatch ? [idMatch] : []),
      );
      if (searchClause) conds.push(searchClause);
    }

    const where = and(...conds);

    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(listingsTable)
      .where(where);

    const rows = await db
      .select({
        id: listingsTable.id,
        title: listingsTable.title,
        make: listingsTable.make,
        model: listingsTable.model,
        year: listingsTable.year,
        price: listingsTable.price,
        status: listingsTable.status,
        viewCount: listingsTable.viewCount,
        createdAt: listingsTable.createdAt,
        updatedAt: listingsTable.updatedAt,
      })
      .from(listingsTable)
      .where(where)
      .orderBy(desc(listingsTable.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    res.json({
      listings: rows,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching seller listings");
    res.status(500).json({ error: "Failed to fetch listings" });
  }
});

// ─── GET /listings/me/counts — counts per status ─────────────────────────────
router.get(
  "/listings/me/counts",
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      if (!(await assertSeller(userId))) {
        res.status(403).json({ error: "Not a seller account" });
        return;
      }

      const rows = await db
        .select({
          status: listingsTable.status,
          count: sql<number>`count(*)::int`,
        })
        .from(listingsTable)
        .where(
          and(
            eq(listingsTable.sellerId, userId),
            ne(listingsTable.status, "deleted"),
          ),
        )
        .groupBy(listingsTable.status);

      const counts: Record<string, number> = {
        active: 0,
        sold: 0,
        pending: 0,
        suspended: 0,
      };
      for (const r of rows) counts[r.status] = r.count;
      res.json({ counts });
    } catch (err) {
      req.log.error({ err }, "Error fetching listing counts");
      res.status(500).json({ error: "Failed to fetch counts" });
    }
  },
);

// ─── POST /listings — create new listing ─────────────────────────────────────
router.post("/listings", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    if (!(await assertSeller(userId))) {
      res.status(403).json({ error: "Not a seller account" });
      return;
    }

    // ── Subscription gate ──────────────────────────────────────────────────────
    const [plan, activeCount] = await Promise.all([
      getSellerPlanLimits(userId),
      countActiveListings(userId),
    ]);

    if (!plan) {
      res.status(403).json({
        error: "No active subscription found. Please subscribe to a plan to list cars.",
        code: "NO_ACTIVE_PLAN",
      });
      return;
    }

    if (activeCount >= plan.maxListings) {
      res.status(403).json({
        error: `You have reached your ${plan.planName} plan limit of ${plan.maxListings} active listing${plan.maxListings !== 1 ? "s" : ""}. Upgrade your plan to list more cars.`,
        code: "LISTING_LIMIT_REACHED",
        limit: plan.maxListings,
        current: activeCount,
      });
      return;
    }
    // ──────────────────────────────────────────────────────────────────────────

    const parsed = parseListingPayload(req.body, false);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const { images, featureIds, ...data } = parsed.data as ListingPayload & {
      make: string;
      model: string;
      year: number;
      price: number;
      location: string;
    };

    // ── Photo count gate ───────────────────────────────────────────────────────
    if (images && images.length > plan.maxPhotos) {
      res.status(400).json({
        error: `Your ${plan.planName} plan allows up to ${plan.maxPhotos} photo${plan.maxPhotos !== 1 ? "s" : ""} per listing. You submitted ${images.length}.`,
        code: "PHOTO_LIMIT_EXCEEDED",
        limit: plan.maxPhotos,
        submitted: images.length,
      });
      return;
    }

    // ── Featured gate ──────────────────────────────────────────────────────────
    if (data.isFeatured && !plan.featuredListingEnabled) {
      res.status(403).json({
        error: `Your ${plan.planName} plan does not include featured listing placement. Upgrade to feature your car.`,
        code: "FEATURED_NOT_ALLOWED",
      });
      return;
    }
    // ──────────────────────────────────────────────────────────────────────────

    // Compute listing expiry from plan duration
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + plan.durationDays);

    // Wrap listing + images + features in a single transaction so a
    // failure half-way doesn't leave an orphan listing in the DB.
    const created = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(listingsTable)
        .values({ sellerId: userId, ...data, expiresAt })
        .returning();

      if (images && images.length > 0) {
        await tx.insert(listingImagesTable).values(
          images.map((img, idx) => ({
            listingId: row.id,
            url: img.url,
            mediaType: img.mediaType ?? "image",
            fileName: img.fileName ?? null,
            fileSize: img.fileSize ?? null,
            displayOrder: idx,
            isPrimary: idx === 0 && img.mediaType !== "video",
          })),
        );
      }

      if (featureIds && featureIds.length > 0) {
        await tx
          .insert(listingFeatureLinksTable)
          .values(featureIds.map((featureId) => ({ listingId: row.id, featureId })))
          .onConflictDoNothing();
      }

      return row;
    });

    const [seller] = await db
      .select({
        email: usersTable.email,
        firstName: usersTable.firstName,
      })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    if (seller?.email) {
      void sendListingPublishedEmail({
        email: seller.email,
        firstName: seller.firstName || "there",
        carName: `${created.make} ${created.model} ${created.year}`,
        price: Number(created.price),
        listingId: created.id,
      }).catch((error) => {
        req.log.warn({ err: error, listingId: created.id }, "listing published email failed");
      });
    }

    res.status(201).json({ listing: created });
  } catch (err) {
    req.log.error({ err }, "Error creating listing");
    res.status(500).json({ error: "Failed to create listing" });
  }
});

// ─── GET /listings/:id — fetch single (owner only for non-active states) ─────
router.get("/listings/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [row] = await db
      .select()
      .from(listingsTable)
      .where(eq(listingsTable.id, id))
      .limit(1);
    if (!row || row.status === "deleted") {
      res.status(404).json({ error: "Listing not found" });
      return;
    }
    if (row.sellerId !== userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const [images, featureLinks, seller, pendingDel] = await Promise.all([
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
          email: usersTable.email,
        })
        .from(usersTable)
        .leftJoin(
          sellerProfilesTable,
          eq(sellerProfilesTable.userId, usersTable.id),
        )
        .where(eq(usersTable.id, row.sellerId))
        .limit(1),
      db
        .select({ id: listingDeletionRequestsTable.id })
        .from(listingDeletionRequestsTable)
        .where(
          and(
            eq(listingDeletionRequestsTable.listingId, id),
            eq(listingDeletionRequestsTable.status, "pending"),
          ),
        )
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
      seller: seller[0] ?? null,
      deletionRequestPending: pendingDel.length > 0,
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching listing");
    res.status(500).json({ error: "Failed to fetch listing" });
  }
});

// ─── POST /listings/:id/deletion-request — request admin approval ───────────
router.post(
  "/listings/:id/deletion-request",
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id)) {
        res.status(400).json({ error: "Invalid id" });
        return;
      }
      if (!(await assertSeller(userId))) {
        res.status(403).json({ error: "Not a seller account" });
        return;
      }
      const [existing] = await db
        .select({
          sellerId: listingsTable.sellerId,
          status: listingsTable.status,
        })
        .from(listingsTable)
        .where(eq(listingsTable.id, id))
        .limit(1);
      if (!existing || existing.status === "deleted") {
        res.status(404).json({ error: "Listing not found" });
        return;
      }
      if (existing.sellerId !== userId) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      const [pending] = await db
        .select({ id: listingDeletionRequestsTable.id })
        .from(listingDeletionRequestsTable)
        .where(
          and(
            eq(listingDeletionRequestsTable.listingId, id),
            eq(listingDeletionRequestsTable.status, "pending"),
          ),
        )
        .limit(1);
      if (pending) {
        res.status(409).json({
          error: "A deletion request for this listing is already pending.",
        });
        return;
      }

      const reason = asString((req.body ?? {}).reason) ?? null;
      const [created] = await db
        .insert(listingDeletionRequestsTable)
        .values({
          listingId: id,
          sellerId: userId,
          reason,
          status: "pending",
        })
        .returning();

      res.status(201).json({ request: created });
    } catch (err) {
      req.log.error({ err }, "Error creating deletion request");
      res.status(500).json({ error: "Failed to submit deletion request" });
    }
  },
);

// ─── PATCH /listings/:id — update fields / status ────────────────────────────
router.patch("/listings/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    if (!(await assertSeller(userId))) {
      res.status(403).json({ error: "Not a seller account" });
      return;
    }
    const [existing] = await db
      .select({ sellerId: listingsTable.sellerId, status: listingsTable.status })
      .from(listingsTable)
      .where(eq(listingsTable.id, id))
      .limit(1);
    if (!existing || existing.status === "deleted") {
      res.status(404).json({ error: "Listing not found" });
      return;
    }
    if (existing.sellerId !== userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const parsed = parseListingPayload(req.body, true);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const { images, featureIds, ...data } = parsed.data;

    // Sellers cannot self-delete via PATCH — that requires admin approval
    // through the deletion-request workflow. Allowed status transitions:
    // active <-> sold | pending. "deleted" and "suspended" are admin-only.
    if (data.status && (data.status === "deleted" || data.status === "suspended")) {
      res.status(403).json({
        error:
          "Sellers cannot set this status. Submit a deletion request instead.",
      });
      return;
    }

    // ── Subscription gates on update ───────────────────────────────────────────
    // Reactivating a listing (status → "active" from a non-active/non-pending
    // state) must re-check the maxListings limit, just like a new listing.
    const isReactivation =
      data.status === "active" &&
      existing.status !== "active" &&
      existing.status !== "pending";

    const needsPlanCheck =
      isReactivation ||
      data.isFeatured === true ||
      (images && images.length > 0);

    if (isReactivation && !(await isSellerAdminVerified(userId))) {
      res.status(403).json({
        error: "Seller is unverified. Admin approval is required before listing cars.",
        code: "SELLER_NOT_VERIFIED",
      });
      return;
    }

    if (needsPlanCheck) {
      const [plan, activeCount] = await Promise.all([
        getSellerPlanLimits(userId),
        isReactivation ? countActiveListings(userId) : Promise.resolve(0),
      ]);
      if (!plan) {
        res.status(403).json({
          error: "No active subscription found.",
          code: "NO_ACTIVE_PLAN",
        });
        return;
      }
      if (isReactivation && activeCount >= plan.maxListings) {
        res.status(403).json({
          error: `You have reached your ${plan.planName} plan limit of ${plan.maxListings} active listing${plan.maxListings !== 1 ? "s" : ""}. Upgrade your plan to list more cars.`,
          code: "LISTING_LIMIT_REACHED",
          limit: plan.maxListings,
          current: activeCount,
        });
        return;
      }
      if (data.isFeatured === true && !plan.featuredListingEnabled) {
        res.status(403).json({
          error: `Your ${plan.planName} plan does not include featured listing placement. Upgrade to feature your car.`,
          code: "FEATURED_NOT_ALLOWED",
        });
        return;
      }
      if (images && images.length > plan.maxPhotos) {
        res.status(400).json({
          error: `Your ${plan.planName} plan allows up to ${plan.maxPhotos} photo${plan.maxPhotos !== 1 ? "s" : ""} per listing. You submitted ${images.length}.`,
          code: "PHOTO_LIMIT_EXCEEDED",
          limit: plan.maxPhotos,
          submitted: images.length,
        });
        return;
      }
    }
    // ──────────────────────────────────────────────────────────────────────────

    const [updated] = await db
      .update(listingsTable)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(listingsTable.id, id))
      .returning();

    if (images) {
      const previousImages = await db
        .select({ url: listingImagesTable.url })
        .from(listingImagesTable)
        .where(eq(listingImagesTable.listingId, id));
      const newUrlSet = new Set(images.map((img) => img.url));
      const removedUrls = previousImages
        .map((row) => row.url)
        .filter((url) => !newUrlSet.has(url));

      await db
        .delete(listingImagesTable)
        .where(eq(listingImagesTable.listingId, id));
      if (images.length > 0) {
        await db.insert(listingImagesTable).values(
          images.map((img, idx) => ({
            listingId: id,
            url: img.url,
            mediaType: img.mediaType ?? "image",
            fileName: img.fileName ?? null,
            fileSize: img.fileSize ?? null,
            displayOrder: idx,
            isPrimary: idx === 0 && img.mediaType !== "video",
          })),
        );
      }

      if (removedUrls.length > 0) {
        for (const oldUrl of removedUrls) {
          void deleteManagedMediaRef(oldUrl, req.log);
        }
      }
    }

    if (featureIds) {
      await db
        .delete(listingFeatureLinksTable)
        .where(eq(listingFeatureLinksTable.listingId, id));
      if (featureIds.length > 0) {
        await db
          .insert(listingFeatureLinksTable)
          .values(featureIds.map((featureId) => ({ listingId: id, featureId })))
          .onConflictDoNothing();
      }
    }

    res.json({ listing: updated });
  } catch (err) {
    req.log.error({ err }, "Error updating listing");
    res.status(500).json({ error: "Failed to update listing" });
  }
});

// ─── DELETE /listings/:id — admin-only; sellers must use deletion-request ────
router.delete("/listings/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    // Look up the user's role inline — only admins may hard-delete.
    const [me] = await db
      .select({ role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    if (!me || me.role !== "admin") {
      res.status(403).json({
        error:
          "Sellers cannot delete listings directly. Submit a deletion request for admin approval.",
      });
      return;
    }
    const [existing] = await db
      .select({ sellerId: listingsTable.sellerId })
      .from(listingsTable)
      .where(eq(listingsTable.id, id))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Listing not found" });
      return;
    }
    await db
      .update(listingsTable)
      .set({ status: "deleted", updatedAt: new Date() })
      .where(eq(listingsTable.id, id));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting listing");
    res.status(500).json({ error: "Failed to delete listing" });
  }
});

export default router;
