import { Router } from "express";
import { and, desc, eq, inArray, isNull, lte, gte, or } from "drizzle-orm";
import { db, cmsBannersTable, auditLogsTable } from "@workspace/db";

const router = Router();

function normalizeImageUrl(url: string): string {
  const v = String(url ?? "").trim();
  if (!v) return v;
  if (/^https?:\/\//i.test(v) || v.startsWith("/api/")) return v;
  if (v.startsWith("/objects/") || v.startsWith("/local/")) return `/api/storage${v}`;
  if (v.startsWith("/storage/")) return `/api${v}`;
  return v;
}

// Resolve a single ad for a slot with fallback positions.
// Example: /api/ads/resolve?positions=landing_hero_desktop,landing_hero_tablet,landing_hero
router.get("/ads/resolve", async (req, res) => {
  try {
    const raw = String(req.query.positions ?? "").trim();
    const positions = raw
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    if (positions.length === 0) {
      return res.status(400).json({ error: "positions query is required" });
    }

    const now = new Date();
    const rows = await db
      .select({
        id: cmsBannersTable.id,
        title: cmsBannersTable.title,
        imageUrl: cmsBannersTable.imageUrl,
        linkUrl: cmsBannersTable.linkUrl,
        position: cmsBannersTable.position,
        startsAt: cmsBannersTable.startsAt,
        endsAt: cmsBannersTable.endsAt,
        createdAt: cmsBannersTable.createdAt,
      })
      .from(cmsBannersTable)
      .where(
        and(
          inArray(cmsBannersTable.position, positions),
          eq(cmsBannersTable.isActive, true),
          or(isNull(cmsBannersTable.startsAt), lte(cmsBannersTable.startsAt, now)),
          or(isNull(cmsBannersTable.endsAt), gte(cmsBannersTable.endsAt, now)),
        ),
      )
      .orderBy(desc(cmsBannersTable.createdAt))
      .limit(200);

    const chosen = positions
      .map((p) => rows.find((r) => r.position === p))
      .find(Boolean);

    if (!chosen) {
      return res.json({ item: null });
    }

    return res.json({
      item: {
        ...chosen,
        imageUrl: normalizeImageUrl(chosen.imageUrl),
      },
    });
  } catch (err) {
    req.log.error({ err }, "resolve ad failed");
    return res.status(500).json({ error: "Failed to resolve ad" });
  }
});

// Track ad impressions for admin analytics.
router.post("/ads/:id/impression", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid ad id" });
    }

    const [ad] = await db
      .select({ id: cmsBannersTable.id })
      .from(cmsBannersTable)
      .where(eq(cmsBannersTable.id, id))
      .limit(1);
    if (!ad) {
      return res.status(404).json({ error: "Ad not found" });
    }

    const body = (req.body ?? {}) as {
      placement?: unknown;
      device?: unknown;
    };
    const placement = String(body.placement ?? "").trim() || null;
    const device = String(body.device ?? "").trim() || null;

    const xf = req.headers["x-forwarded-for"];
    const ip = Array.isArray(xf)
      ? xf[0]
      : typeof xf === "string"
        ? xf.split(",")[0]?.trim()
        : req.ip || null;

    await db.insert(auditLogsTable).values({
      userId: null,
      action: "ad_impression",
      resourceType: "cms_banner",
      resourceId: id,
      details: {
        placement,
        device,
      },
      ipAddress: ip || null,
      userAgent: req.get("user-agent") || null,
    });

    return res.status(201).json({ success: true });
  } catch (err) {
    req.log.error({ err }, "track ad impression failed");
    return res.status(500).json({ error: "Failed to track impression" });
  }
});

export default router;
