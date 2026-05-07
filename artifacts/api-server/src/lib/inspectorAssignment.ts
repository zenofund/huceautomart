import {
  db,
  inspectionsTable,
  inspectorProfilesTable,
  listingsTable,
  usersTable,
} from "@workspace/db";
import { and, count, eq, ne, isNull } from "drizzle-orm";

/**
 * Proximity scoring (text-based, no GPS required).
 *
 * Strategy:
 *  1. Extract words from the inspection location (from the inspection record or
 *     the listing's location field as fallback).
 *  2. For each available inspector compare their `serviceArea` text against those
 *     words. Each overlapping word (≥ 3 chars) adds +2 to their score.
 *  3. Tiebreak: subtract 0.1 per active (non-completed, non-cancelled) job so
 *     the least-loaded inspector wins among equal-proximity candidates.
 *  4. Assign the highest-scoring inspector and flip the status to `assigned`.
 *  5. Returns the assigned inspector's userId or null if no inspector available.
 */
export async function autoAssignInspector(inspectionId: number): Promise<number | null> {
  const [inspection] = await db
    .select({
      id: inspectionsTable.id,
      status: inspectionsTable.status,
      inspectorId: inspectionsTable.inspectorId,
      inspectionLocation: inspectionsTable.inspectionLocation,
      listingId: inspectionsTable.listingId,
    })
    .from(inspectionsTable)
    .where(eq(inspectionsTable.id, inspectionId))
    .limit(1);

  if (!inspection) return null;
  if (inspection.inspectorId) return inspection.inspectorId;

  const [listing] = await db
    .select({ location: listingsTable.location })
    .from(listingsTable)
    .where(eq(listingsTable.id, inspection.listingId))
    .limit(1);

  const targetLocation = (
    inspection.inspectionLocation ?? listing?.location ?? ""
  ).toLowerCase();

  const inspectors = await db
    .select({
      userId: usersTable.id,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      serviceArea: inspectorProfilesTable.serviceArea,
    })
    .from(inspectorProfilesTable)
    .innerJoin(usersTable, eq(usersTable.id, inspectorProfilesTable.userId))
    .where(
      and(
        eq(inspectorProfilesTable.isAvailable, true),
        eq(usersTable.role, "inspector"),
      ),
    );

  if (inspectors.length === 0) return null;

  const activeCounts = await db
    .select({
      inspectorId: inspectionsTable.inspectorId,
      activeCount: count(),
    })
    .from(inspectionsTable)
    .where(
      and(
        ne(inspectionsTable.status, "completed"),
        ne(inspectionsTable.status, "cancelled"),
        isNull(inspectionsTable.inspectorId).if(false),
      ),
    )
    .groupBy(inspectionsTable.inspectorId);

  const countMap = new Map(
    activeCounts
      .filter((r) => r.inspectorId !== null)
      .map((r) => [r.inspectorId as number, Number(r.activeCount)]),
  );

  const locationWords = targetLocation
    .split(/[\s,\-/]+/)
    .filter((w) => w.length >= 3);

  const scored = inspectors.map((insp) => {
    const area = (insp.serviceArea ?? "").toLowerCase();
    const areaWords = area.split(/[\s,\-/]+/).filter((w) => w.length >= 3);

    let score = 0;
    for (const word of locationWords) {
      if (areaWords.some((a) => a.includes(word) || word.includes(a))) {
        score += 2;
      }
    }
    score -= (countMap.get(insp.userId) ?? 0) * 0.1;

    return { userId: insp.userId, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best) return null;

  await db
    .update(inspectionsTable)
    .set({ inspectorId: best.userId, status: "assigned", updatedAt: new Date() })
    .where(eq(inspectionsTable.id, inspectionId));

  return best.userId;
}
