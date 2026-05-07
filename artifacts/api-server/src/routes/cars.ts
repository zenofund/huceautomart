import { Router } from "express";
import {
  db,
  listingsTable,
  listingImagesTable,
  listingFeatureLinksTable,
  carFeaturesTable,
  usersTable,
  sellerProfilesTable,
  subscriptionsTable,
  subscriptionPlansTable,
} from "@workspace/db";
import {
  eq,
  and,
  gte,
  lte,
  ilike,
  desc,
  count,
  sql,
  inArray,
  type SQL,
} from "drizzle-orm";

const router = Router();

// Compose seller display name: businessName → "first last" → empty.
// COALESCE / NULLIF keep the result deterministic when fields are missing.
const sellerNameSql = sql<string>`COALESCE(
  NULLIF(${sellerProfilesTable.businessName}, ''),
  NULLIF(TRIM(CONCAT_WS(' ', ${usersTable.firstName}, ${usersTable.lastName})), ''),
  ''
)`.as("sellerName");

const ONLINE_MS = 5 * 60 * 1000;

// Ranking for public listing visibility:
// 1) Featured listings first
// 2) Sellers on higher subscription tiers first (paid > free)
// 3) Newer listings first as final tie-breaker
const sellerTierRankSql = sql<number>`COALESCE((
  SELECT ${subscriptionPlansTable.price}
  FROM ${subscriptionsTable}
  INNER JOIN ${subscriptionPlansTable}
    ON ${subscriptionPlansTable.id} = ${subscriptionsTable.planId}
  WHERE
    ${subscriptionsTable.sellerId} = ${listingsTable.sellerId}
    AND ${subscriptionsTable.status} = 'active'
    AND ${subscriptionsTable.expiresAt} >= NOW()
    AND ${subscriptionPlansTable.isActive} = true
  ORDER BY
    ${subscriptionPlansTable.price} DESC,
    ${subscriptionPlansTable.maxListings} DESC,
    ${subscriptionPlansTable.maxPhotos} DESC,
    ${subscriptionPlansTable.id} DESC
  LIMIT 1
), 0)`;

const baseCarSelect = {
  id: listingsTable.id,
  make: listingsTable.make,
  model: listingsTable.model,
  year: listingsTable.year,
  price: listingsTable.price,
  condition: listingsTable.condition,
  location: listingsTable.location,
  mileage: listingsTable.mileage,
  color: listingsTable.color,
  transmission: listingsTable.transmission,
  fuelType: listingsTable.fuelType,
  carType: listingsTable.carType,
  driveType: listingsTable.driveType,
  doors: listingsTable.doors,
  vin: listingsTable.vin,
  description: listingsTable.description,
  sellerId: listingsTable.sellerId,
  sellerName: sellerNameSql,
  sellerLastSeenAt: usersTable.lastSeenAt,
  sellerAvatarUrl: usersTable.profilePhotoUrl,
  featured: listingsTable.isFeatured,
  createdAt: listingsTable.createdAt,
};

type BaseCarRow = {
  id: number;
  sellerName: string | null;
  sellerLastSeenAt?: Date | null;
  sellerAvatarUrl?: string | null;
  [key: string]: unknown;
};

type SerializedCar<T extends BaseCarRow> = Omit<T, "sellerLastSeenAt" | "sellerAvatarUrl"> & {
  sellerName: string;
  sellerIsOnline: boolean;
  sellerAvatarUrl: string | null;
  images: string[];
};

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

function sortImagesPreferredFirst(images: string[]): string[] {
  return [...images].sort((a, b) => imagePriority(a) - imagePriority(b));
}

// Fetch ordered image URLs for a batch of listings in a single query.
async function attachImages<T extends BaseCarRow>(
  rows: T[],
): Promise<SerializedCar<T>[]> {
  const serialize = ({ sellerLastSeenAt, sellerAvatarUrl, ...r }: T, images: string[]): SerializedCar<T> => ({
    ...(r as Omit<T, "sellerLastSeenAt" | "sellerAvatarUrl">),
    sellerName: (r.sellerName ?? "") as string,
    sellerIsOnline: sellerLastSeenAt
      ? Date.now() - new Date(sellerLastSeenAt as Date).getTime() < ONLINE_MS
      : false,
    sellerAvatarUrl: (sellerAvatarUrl as string | null | undefined) ?? null,
    images,
  });

  if (rows.length === 0) return rows.map((r) => serialize(r, []));

  const ids = rows.map((r) => r.id);
  const imgs = await db
    .select({
      listingId: listingImagesTable.listingId,
      url: listingImagesTable.url,
    })
    .from(listingImagesTable)
    .where(
      and(
        inArray(listingImagesTable.listingId, ids),
        eq(listingImagesTable.mediaType, "image"),
      ),
    )
    .orderBy(listingImagesTable.displayOrder, listingImagesTable.id);
  const byId = new Map<number, string[]>();
  for (const r of imgs) {
    const normalizedUrl = normalizeListingImageUrl(r.url);
    const list = byId.get(r.listingId);
    if (list) list.push(normalizedUrl);
    else byId.set(r.listingId, [normalizedUrl]);
  }
  for (const [listingId, urls] of byId.entries()) {
    byId.set(listingId, sortImagesPreferredFirst(urls));
  }
  return rows.map((r) => serialize(r, byId.get(r.id) ?? []));
}

// Common joins used by every read query so seller display name resolves
// without extra round-trips.
function fromListingsWithSeller() {
  return db
    .select(baseCarSelect)
    .from(listingsTable)
    .leftJoin(usersTable, eq(usersTable.id, listingsTable.sellerId))
    .leftJoin(
      sellerProfilesTable,
      eq(sellerProfilesTable.userId, listingsTable.sellerId),
    );
}

router.get("/cars", async (req, res) => {
  try {
    const {
      make,
      model,
      year,
      condition,
      carType,
      minPrice,
      maxPrice,
      location,
      sellerId,
      page = "1",
      limit = "12",
    } = req.query as Record<string, string>;

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 12;
    const offset = (pageNum - 1) * limitNum;

    // Always restrict to active listings — sold/pending/deleted/suspended
    // listings should never appear on public browse pages.
    const conditions: SQL[] = [eq(listingsTable.status, "active")];

    if (make) conditions.push(ilike(listingsTable.make, `%${make}%`));
    if (model) conditions.push(ilike(listingsTable.model, `%${model}%`));
    if (year) conditions.push(eq(listingsTable.year, parseInt(year)));
    if (condition) {
      // The buyer browse filter only exposes new/used; map "used" to also
      // include certified pre-owned so CPO cars don't disappear behind a
      // narrow filter choice.
      if (condition === "used") {
        conditions.push(
          sql`${listingsTable.condition} IN ('used', 'certified_pre_owned')`,
        );
      } else if (condition === "new" || condition === "certified_pre_owned") {
        conditions.push(
          eq(
            listingsTable.condition,
            condition as "new" | "used" | "certified_pre_owned",
          ),
        );
      }
    }
    if (location)
      conditions.push(ilike(listingsTable.location, `%${location}%`));
    if (minPrice)
      conditions.push(gte(listingsTable.price, parseFloat(minPrice)));
    if (maxPrice)
      conditions.push(lte(listingsTable.price, parseFloat(maxPrice)));
    if (carType)
      conditions.push(ilike(listingsTable.carType, carType));
    if (sellerId)
      conditions.push(eq(listingsTable.sellerId, parseInt(sellerId)));

    const whereClause = and(...conditions);

    const [rows, totalResult] = await Promise.all([
      fromListingsWithSeller()
        .where(whereClause)
        .orderBy(
          desc(listingsTable.isFeatured),
          desc(sellerTierRankSql),
          desc(listingsTable.createdAt),
        )
        .limit(limitNum)
        .offset(offset),
      db
        .select({ count: count() })
        .from(listingsTable)
        .where(whereClause),
    ]);

    const data = await attachImages(rows);
    const total = totalResult[0]?.count ?? 0;
    const totalPages = Math.ceil(total / limitNum);

    res.json({ data, total, page: pageNum, totalPages });
  } catch (err) {
    req.log.error({ err }, "Error listing cars");
    res.status(500).json({ error: "Failed to list cars" });
  }
});

router.get("/cars/featured", async (req, res) => {
  try {
    const rows = await fromListingsWithSeller()
      .where(
        and(
          eq(listingsTable.status, "active"),
          eq(listingsTable.isFeatured, true),
        ),
      )
      .orderBy(desc(sellerTierRankSql), desc(listingsTable.createdAt))
      .limit(8);
    res.json(await attachImages(rows));
  } catch (err) {
    req.log.error({ err }, "Error fetching featured cars");
    res.status(500).json({ error: "Failed to fetch featured cars" });
  }
});

router.get("/cars/recent", async (req, res) => {
  try {
    const rows = await fromListingsWithSeller()
      .where(eq(listingsTable.status, "active"))
      .orderBy(
        desc(listingsTable.isFeatured),
        desc(sellerTierRankSql),
        desc(listingsTable.createdAt),
      )
      .limit(12);
    res.json(await attachImages(rows));
  } catch (err) {
    req.log.error({ err }, "Error fetching recent cars");
    res.status(500).json({ error: "Failed to fetch recent cars" });
  }
});

router.get("/cars/locations", async (req, res) => {
  try {
    const rows = await db
      .selectDistinct({ location: listingsTable.location })
      .from(listingsTable)
      .where(eq(listingsTable.status, "active"));
    
    const locations = rows
      .map(r => r.location)
      .filter(Boolean)
      .sort();
      
    res.json(locations);
  } catch (err) {
    req.log.error({ err }, "Error fetching locations");
    res.status(500).json({ error: "Failed to fetch locations" });
  }
});

router.get("/cars/:id", async (req, res) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid car ID" });
      return;
    }

    const rows = await fromListingsWithSeller()
      .where(
        and(eq(listingsTable.id, id), eq(listingsTable.status, "active")),
      )
      .limit(1);

    if (rows.length === 0) {
      res.status(404).json({ error: "Car not found" });
      return;
    }

    // Increment view count fire-and-forget — never blocks the response.
    db.update(listingsTable)
      .set({ viewCount: sql`${listingsTable.viewCount} + 1` })
      .where(eq(listingsTable.id, id))
      .catch((e) => req.log.warn({ err: e }, "Failed to increment view count"));

    const [withImages] = await attachImages(rows);

    // Fetch the listing's selected features grouped by featureGroup so the
    // detail page can render the actual seller-selected feature set.
    const featureRows = await db
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
      .where(eq(listingFeatureLinksTable.listingId, id))
      .orderBy(carFeaturesTable.featureGroup, carFeaturesTable.name);

    const features: Record<string, { id: number; name: string }[]> = {};
    for (const f of featureRows) {
      const g = f.featureGroup ?? "Other";
      if (!features[g]) features[g] = [];
      features[g].push({ id: f.id, name: f.name });
    }

    res.json({ ...withImages, features });
  } catch (err) {
    req.log.error({ err }, "Error fetching car");
    res.status(500).json({ error: "Failed to fetch car" });
  }
});

export default router;
