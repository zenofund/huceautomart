import { db, subscriptionsTable, subscriptionPlansTable, listingsTable } from "@workspace/db";
import { and, eq, count, inArray, gt } from "drizzle-orm";

export interface PlanLimits {
  planId: number;
  planName: string;
  maxListings: number;
  maxPhotos: number;
  featuredListingEnabled: boolean;
  analyticsDashboardEnabled: boolean;
  durationDays: number;
}

export async function getSellerPlanLimits(userId: number): Promise<PlanLimits | null> {
  const now = new Date();
  const [sub] = await db
    .select({
      planId: subscriptionPlansTable.id,
      planName: subscriptionPlansTable.name,
      maxListings: subscriptionPlansTable.maxListings,
      maxPhotos: subscriptionPlansTable.maxPhotos,
      featuredListingEnabled: subscriptionPlansTable.featuredListingEnabled,
      analyticsDashboardEnabled: subscriptionPlansTable.analyticsDashboardEnabled,
      durationDays: subscriptionPlansTable.durationDays,
    })
    .from(subscriptionsTable)
    .innerJoin(subscriptionPlansTable, eq(subscriptionsTable.planId, subscriptionPlansTable.id))
    .where(
      and(
        eq(subscriptionsTable.sellerId, userId),
        eq(subscriptionsTable.status, "active"),
        gt(subscriptionsTable.expiresAt, now),
        eq(subscriptionPlansTable.isActive, true),
      ),
    )
    .orderBy(subscriptionsTable.expiresAt)
    .limit(1);

  return sub ?? null;
}

export async function countActiveListings(sellerId: number): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(listingsTable)
    .where(
      and(
        eq(listingsTable.sellerId, sellerId),
        inArray(listingsTable.status, ["active", "pending"]),
      ),
    );
  return row?.n ?? 0;
}
