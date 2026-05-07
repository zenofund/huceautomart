import { Router } from "express";
import {
  db,
  usersTable,
  sellerProfilesTable,
  reviewsTable,
  listingsTable,
} from "@workspace/db";
import { eq, desc, sql, and, count, inArray } from "drizzle-orm";

const ONLINE_THRESHOLD_MS = 5 * 60 * 1000;

function isOnline(lastSeenAt: Date | null): boolean {
  if (!lastSeenAt) return false;
  return Date.now() - lastSeenAt.getTime() < ONLINE_THRESHOLD_MS;
}

const router = Router();

const sellerSelect = {
  id: usersTable.id,
  name: sql<string>`TRIM(CONCAT_WS(' ', ${usersTable.firstName}, ${usersTable.lastName}))`.as("name"),
  businessName: sellerProfilesTable.businessName,
  lotName: sellerProfilesTable.lotName,
  location: sellerProfilesTable.location,
  phone: usersTable.phone,
  email: usersTable.email,
  verified: sellerProfilesTable.isVerified,
  rating: sellerProfilesTable.rating,
  totalListings: sellerProfilesTable.totalListings,
  joinedAt: usersTable.createdAt,
  lastSeenAt: usersTable.lastSeenAt,
  profilePhotoUrl: usersTable.profilePhotoUrl,
} as const;

function serialize(row: any) {
  const { lastSeenAt, profilePhotoUrl, ...rest } = row as {
    lastSeenAt: Date | null;
    profilePhotoUrl: string | null;
    [k: string]: unknown;
  };
  return {
    ...rest,
    avatarUrl: profilePhotoUrl ?? null,
    isOnline: isOnline(lastSeenAt),
  };
}

router.get("/sellers", async (req, res) => {
  try {
    const rows = await db
      .select(sellerSelect)
      .from(usersTable)
      .innerJoin(sellerProfilesTable, eq(sellerProfilesTable.userId, usersTable.id))
      .where(and(eq(usersTable.role, "seller"), eq(sellerProfilesTable.isVerified, true)))
      .orderBy(desc(sellerProfilesTable.rating));
    const sellerIds = rows.map((r) => r.id);
    const activeBySeller = sellerIds.length
      ? await db
          .select({
            sellerId: listingsTable.sellerId,
            activeListings: count(),
          })
          .from(listingsTable)
          .where(
            and(
              inArray(listingsTable.sellerId, sellerIds),
              eq(listingsTable.status, "active"),
            ),
          )
          .groupBy(listingsTable.sellerId)
      : [];
    const activeMap = new Map(activeBySeller.map((r) => [r.sellerId, r.activeListings]));

    res.json(
      rows.map((row) =>
        serialize({
          ...row,
          // Keep UI label accurate: this page shows "Active Listings".
          totalListings: Number(activeMap.get(row.id) ?? 0),
        }),
      ),
    );
  } catch (err) {
    req.log.error({ err }, "Error listing sellers");
    res.status(500).json({ error: "Failed to list sellers" });
  }
});

router.get("/sellers/:id", async (req, res) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid seller ID" });
      return;
    }

    const [row] = await db
      .select(sellerSelect)
      .from(usersTable)
      .innerJoin(sellerProfilesTable, eq(sellerProfilesTable.userId, usersTable.id))
      .where(
        and(
          eq(usersTable.id, id),
          eq(usersTable.role, "seller"),
          eq(sellerProfilesTable.isVerified, true),
        ),
      )
      .limit(1);

    if (!row) {
      res.status(404).json({ error: "Seller not found" });
      return;
    }

    const [active] = await db
      .select({ c: count() })
      .from(listingsTable)
      .where(and(eq(listingsTable.sellerId, id), eq(listingsTable.status, "active")));

    res.json(
      serialize({
        ...row,
        totalListings: Number(active?.c ?? 0),
      }),
    );
  } catch (err) {
    req.log.error({ err }, "Error fetching seller");
    res.status(500).json({ error: "Failed to fetch seller" });
  }
});

router.get("/sellers/:id/reviews", async (req, res) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid seller ID" });
      return;
    }

    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 10)));
    const offset = (page - 1) * limit;

    const [seller] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .innerJoin(sellerProfilesTable, eq(sellerProfilesTable.userId, usersTable.id))
      .where(
        and(
          eq(usersTable.id, id),
          eq(usersTable.role, "seller"),
          eq(sellerProfilesTable.isVerified, true),
        ),
      )
      .limit(1);
    if (!seller) {
      res.status(404).json({ error: "Seller not found" });
      return;
    }

    const [totalRow] = await db
      .select({ total: count() })
      .from(reviewsTable)
      .where(eq(reviewsTable.sellerId, id));
    const total = Number(totalRow?.total ?? 0);

    const rows = await db
      .select({
        id: reviewsTable.id,
        rating: reviewsTable.rating,
        comment: reviewsTable.comment,
        createdAt: reviewsTable.createdAt,
        buyerId: usersTable.id,
        buyerName: sql<string>`TRIM(CONCAT_WS(' ', ${usersTable.firstName}, ${usersTable.lastName}))`.as("buyer_name"),
        buyerAvatarUrl: usersTable.profilePhotoUrl,
        listingId: listingsTable.id,
        listingTitle: listingsTable.title,
      })
      .from(reviewsTable)
      .innerJoin(usersTable, eq(usersTable.id, reviewsTable.buyerId))
      .leftJoin(listingsTable, eq(listingsTable.id, reviewsTable.listingId))
      .where(eq(reviewsTable.sellerId, id))
      .orderBy(desc(reviewsTable.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      items: rows,
    });
  } catch (err) {
    req.log.error({ err }, "Error listing seller reviews");
    res.status(500).json({ error: "Failed to fetch seller reviews" });
  }
});

export default router;
