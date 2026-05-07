import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { listingsTable, cmsNewsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

const router = Router();

/**
 * Generate SEO-friendly slug
 */
function generateSlug(text: string): string {
  if (!text) return "";
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/[^\w-]+/g, "")
    .replace(/--+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Dynamic XML Sitemap Generator
 */
router.get("/sitemap.xml", async (req: Request, res: Response) => {
  try {
    const baseUrl = process.env.ALLOWED_ORIGIN?.replace(/`/g, "").trim() || "https://huceautomart.com";

    // Fetch active car listings
    const activeListings = await db
      .select({
        id: listingsTable.id,
        make: listingsTable.make,
        model: listingsTable.model,
        year: listingsTable.year,
        updatedAt: listingsTable.updatedAt,
      })
      .from(listingsTable)
      .where(and(eq(listingsTable.status, "active")));

    // Fetch active news articles
    const activeNews = await db
      .select({
        slug: cmsNewsTable.slug,
        updatedAt: cmsNewsTable.updatedAt,
      })
      .from(cmsNewsTable)
      .where(eq(cmsNewsTable.status, "published"));

    // Build XML
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

    // Add static pages
    const staticPages = ["", "/cars", "/news", "/sign-in", "/sign-up"];
    for (const page of staticPages) {
      xml += `  <url>\n`;
      xml += `    <loc>${baseUrl}${page}</loc>\n`;
      xml += `    <changefreq>daily</changefreq>\n`;
      xml += `    <priority>${page === "" ? "1.0" : "0.8"}</priority>\n`;
      xml += `  </url>\n`;
    }

    // Add car detail pages
    for (const car of activeListings) {
      const slug = generateSlug(`${car.year} ${car.make} ${car.model}`);
      xml += `  <url>\n`;
      xml += `    <loc>${baseUrl}/cars/${car.id}-${slug}</loc>\n`;
      xml += `    <lastmod>${car.updatedAt.toISOString()}</lastmod>\n`;
      xml += `    <changefreq>weekly</changefreq>\n`;
      xml += `    <priority>0.9</priority>\n`;
      xml += `  </url>\n`;
    }

    // Add news article pages
    for (const news of activeNews) {
      xml += `  <url>\n`;
      xml += `    <loc>${baseUrl}/news/${news.slug}</loc>\n`;
      xml += `    <lastmod>${news.updatedAt.toISOString()}</lastmod>\n`;
      xml += `    <changefreq>monthly</changefreq>\n`;
      xml += `    <priority>0.7</priority>\n`;
      xml += `  </url>\n`;
    }

    xml += `</urlset>`;

    res.header("Content-Type", "application/xml");
    res.send(xml);
  } catch (error) {
    res.status(500).send("Error generating sitemap");
  }
});

export default router;