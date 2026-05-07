import { Router } from "express";
import { db, listingsTable, usersTable } from "@workspace/db";
import { eq, and, count, avg, sql } from "drizzle-orm";

const router = Router();

router.get("/stats/overview", async (req, res) => {
  try {
    const activeFilter = eq(listingsTable.status, "active");

    const [
      totalCarsResult,
      totalSellersResult,
      newCarsResult,
      usedCarsResult,
      avgPriceResult,
      topLocationResult,
    ] = await Promise.all([
      db.select({ count: count() }).from(listingsTable).where(activeFilter),
      db
        .select({ count: count() })
        .from(usersTable)
        .where(eq(usersTable.role, "seller")),
      db
        .select({ count: count() })
        .from(listingsTable)
        .where(and(activeFilter, eq(listingsTable.condition, "new"))),
      db
        .select({ count: count() })
        .from(listingsTable)
        .where(
          and(
            activeFilter,
            sql`${listingsTable.condition} IN ('used', 'certified_pre_owned')`,
          ),
        ),
      db
        .select({ avg: avg(listingsTable.price) })
        .from(listingsTable)
        .where(activeFilter),
      db
        .select({ location: listingsTable.location, count: count() })
        .from(listingsTable)
        .where(activeFilter)
        .groupBy(listingsTable.location)
        .orderBy(sql`count(*) DESC`)
        .limit(1),
    ]);

    res.json({
      totalCars: totalCarsResult[0]?.count ?? 0,
      totalSellers: totalSellersResult[0]?.count ?? 0,
      totalNewCars: newCarsResult[0]?.count ?? 0,
      totalUsedCars: usedCarsResult[0]?.count ?? 0,
      avgPrice: parseFloat(avgPriceResult[0]?.avg ?? "0"),
      topLocation: topLocationResult[0]?.location ?? "Lagos",
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching stats overview");
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

router.get("/stats/makes", async (req, res) => {
  try {
    const results = await db
      .select({ make: listingsTable.make, count: count() })
      .from(listingsTable)
      .where(eq(listingsTable.status, "active"))
      .groupBy(listingsTable.make)
      .orderBy(sql`count(*) DESC`);

    res.json(results);
  } catch (err) {
    req.log.error({ err }, "Error fetching stats by make");
    res.status(500).json({ error: "Failed to fetch make stats" });
  }
});

export default router;
