import { Router } from "express";
import { db, cmsNewsTable, usersTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";

const router = Router();

function normalizeNewsImageUrl(url: string): string {
  const v = String(url ?? "").trim();
  if (!v) return v;
  if (/^https?:\/\//i.test(v) || v.startsWith("/api/")) return v;
  if (v.startsWith("/objects/") || v.startsWith("/local/")) return `/api/storage${v}`;
  if (v.startsWith("/storage/")) return `/api${v}`;
  return v;
}

function parseNewsTags(raw: string | null | undefined): string[] {
  return String(raw ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

router.get("/news", async (req, res) => {
  try {
    const limit = parseInt((req.query["limit"] as string) || "10") || 10;

    const articles = await db
      .select({
        id: cmsNewsTable.id,
        title: cmsNewsTable.title,
        excerpt: cmsNewsTable.excerpt,
        tags: cmsNewsTable.tags,
        content: cmsNewsTable.content,
        imageUrl: cmsNewsTable.imageUrl,
        slug: cmsNewsTable.slug,
        authorName: sql<string>`concat(${usersTable.firstName}, ' ', ${usersTable.lastName})`,
        publishedAt: cmsNewsTable.publishedAt,
        createdAt: cmsNewsTable.createdAt,
      })
      .from(cmsNewsTable)
      .leftJoin(usersTable, eq(cmsNewsTable.authorId, usersTable.id))
      .where(eq(cmsNewsTable.status, "published"))
      .orderBy(desc(cmsNewsTable.createdAt))
      .limit(limit);

    const normalizedArticles = articles.map((article) => ({
      ...article,
      tags: parseNewsTags(article.tags),
      imageUrl: article.imageUrl ? normalizeNewsImageUrl(article.imageUrl) : null,
    }));

    res.json(normalizedArticles);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch news" });
  }
});

router.get("/news/:slug", async (req, res) => {
  try {
    const { slug } = req.params;

    const [article] = await db
      .select({
        id: cmsNewsTable.id,
        title: cmsNewsTable.title,
        excerpt: cmsNewsTable.excerpt,
        tags: cmsNewsTable.tags,
        content: cmsNewsTable.content,
        imageUrl: cmsNewsTable.imageUrl,
        slug: cmsNewsTable.slug,
        authorName: sql<string>`concat(${usersTable.firstName}, ' ', ${usersTable.lastName})`,
        likesCount: cmsNewsTable.likesCount,
        publishedAt: cmsNewsTable.publishedAt,
        createdAt: cmsNewsTable.createdAt,
      })
      .from(cmsNewsTable)
      .leftJoin(usersTable, eq(cmsNewsTable.authorId, usersTable.id))
      .where(
        and(
          eq(cmsNewsTable.slug, slug),
          eq(cmsNewsTable.status, "published"),
        ),
      )
      .limit(1);

    if (!article) {
      res.status(404).json({ error: "Article not found" });
      return;
    }

    res.json({
      ...article,
      tags: parseNewsTags(article.tags),
      imageUrl: article.imageUrl ? normalizeNewsImageUrl(article.imageUrl) : null,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch article" });
  }
});

router.post("/news/:slug/like", async (req, res) => {
  try {
    const { slug } = req.params;
    const action = req.body.action as "like" | "unlike";

    if (action !== "like" && action !== "unlike") {
      res.status(400).json({ error: "Invalid action" });
      return;
    }

    const [article] = await db
      .select({ id: cmsNewsTable.id, likesCount: cmsNewsTable.likesCount })
      .from(cmsNewsTable)
      .where(
        and(
          eq(cmsNewsTable.slug, slug),
          eq(cmsNewsTable.status, "published"),
        )
      )
      .limit(1);

    if (!article) {
      res.status(404).json({ error: "Article not found" });
      return;
    }

    let newCount = article.likesCount;
    if (action === "like") {
      newCount += 1;
    } else {
      newCount = Math.max(0, newCount - 1);
    }

    await db
      .update(cmsNewsTable)
      .set({ likesCount: newCount })
      .where(eq(cmsNewsTable.id, article.id));

    res.json({ likesCount: newCount });
  } catch (err) {
    req.log.error({ err }, "Error toggling news like");
    res.status(500).json({ error: "Failed to toggle like" });
  }
});

export default router;
