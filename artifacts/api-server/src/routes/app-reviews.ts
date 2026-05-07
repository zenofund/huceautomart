import { Router } from "express";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db, testimonialsTable, usersTable } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../lib/auth-middleware";

const router = Router();
let didEnsureSchema = false;

async function ensureAppReviewsSchema() {
  if (didEnsureSchema) return;
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
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_testimonials_status_created ON testimonials(status, created_at DESC);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_testimonials_user ON testimonials(user_id, status);`);
  didEnsureSchema = true;
}

router.get("/app-reviews", async (req, res) => {
  try {
    await ensureAppReviewsSchema();
    const rawLimit = Number(req.query.limit ?? 9);
    const limit = Number.isFinite(rawLimit)
      ? Math.max(1, Math.min(30, Math.trunc(rawLimit)))
      : 9;
    const rows = await db
      .select({
        id: testimonialsTable.id,
        rating: testimonialsTable.rating,
        title: testimonialsTable.title,
        comment: testimonialsTable.comment,
        createdAt: testimonialsTable.createdAt,
        userId: usersTable.id,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        role: usersTable.role,
      })
      .from(testimonialsTable)
      .innerJoin(usersTable, eq(usersTable.id, testimonialsTable.userId))
      .where(eq(testimonialsTable.status, "approved"))
      .orderBy(desc(testimonialsTable.approvedAt), desc(testimonialsTable.id))
      .limit(limit);

    return res.json({
      items: rows.map((r) => ({
        id: r.id,
        rating: r.rating,
        title: r.title,
        comment: r.comment,
        createdAt: r.createdAt,
        user: {
          id: r.userId,
          name: `${r.firstName} ${r.lastName}`.trim(),
          role: r.role,
        },
      })),
    });
  } catch (err) {
    req.log.error({ err }, "list app reviews failed");
    return res.status(500).json({ error: "Failed to fetch app reviews" });
  }
});

router.get("/app-reviews/me", requireAuth, async (req: AuthRequest, res) => {
  try {
    await ensureAppReviewsSchema();
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: "Authentication required" });

    const rows = await db
      .select({
        id: testimonialsTable.id,
        rating: testimonialsTable.rating,
        title: testimonialsTable.title,
        comment: testimonialsTable.comment,
        status: testimonialsTable.status,
        adminNote: testimonialsTable.adminNote,
        createdAt: testimonialsTable.createdAt,
        updatedAt: testimonialsTable.updatedAt,
      })
      .from(testimonialsTable)
      .where(eq(testimonialsTable.userId, userId))
      .orderBy(desc(testimonialsTable.createdAt), desc(testimonialsTable.id));

    return res.json({ items: rows });
  } catch (err) {
    req.log.error({ err }, "list my app reviews failed");
    return res.status(500).json({ error: "Failed to fetch your app reviews" });
  }
});

router.post("/app-reviews", requireAuth, async (req: AuthRequest, res) => {
  try {
    await ensureAppReviewsSchema();
    const userId = req.user?.userId;
    const role = req.user?.role;
    if (!userId || !role) return res.status(401).json({ error: "Authentication required" });
    if (!["buyer", "seller", "inspector"].includes(role)) {
      return res.status(403).json({ error: "Only buyers, sellers, and inspectors can submit app reviews" });
    }

    const { rating, title, comment } = req.body as {
      rating?: number;
      title?: string;
      comment?: string;
    };
    const cleanTitle = String(title ?? "").trim();
    const cleanComment = String(comment ?? "").trim();
    const cleanRating = Number(rating ?? 0);

    if (!cleanTitle || cleanTitle.length < 3) {
      return res.status(400).json({ error: "Title must be at least 3 characters" });
    }
    if (!cleanComment || cleanComment.length < 10) {
      return res.status(400).json({ error: "Comment must be at least 10 characters" });
    }
    if (!Number.isFinite(cleanRating) || cleanRating < 1 || cleanRating > 5) {
      return res.status(400).json({ error: "Rating must be between 1 and 5" });
    }

    const pending = await db
      .select({ id: testimonialsTable.id })
      .from(testimonialsTable)
      .where(and(eq(testimonialsTable.userId, userId), eq(testimonialsTable.status, "pending")))
      .orderBy(asc(testimonialsTable.id))
      .limit(1);
    if (pending.length > 0) {
      return res.status(409).json({ error: "You already have a pending app review awaiting approval" });
    }

    const [created] = await db
      .insert(testimonialsTable)
      .values({
        userId,
        role,
        rating: cleanRating,
        title: cleanTitle,
        comment: cleanComment,
        status: "pending",
      })
      .returning();

    return res.status(201).json({ item: created });
  } catch (err) {
    req.log.error({ err }, "create app review failed");
    return res.status(500).json({ error: "Failed to submit app review" });
  }
});

export default router;
