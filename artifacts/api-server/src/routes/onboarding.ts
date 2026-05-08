import { Router, Request, Response } from "express";
import { db, onboardingSlidesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAdmin, type AuthRequest } from "../lib/auth-middleware";
import { z } from "zod";

const router = Router();

// ==========================================
// PUBLIC ROUTES
// ==========================================

// Get active onboarding slides for the mobile app
router.get("/app/onboarding", async (req, res) => {
  try {
    const slides = await db
      .select()
      .from(onboardingSlidesTable)
      .where(eq(onboardingSlidesTable.isActive, true))
      .orderBy(desc(onboardingSlidesTable.order));

    return res.json(slides);
  } catch (error) {
    console.error("Error fetching onboarding slides:", error);
    return res.status(500).json({ error: "Failed to fetch onboarding slides" });
  }
});

// ==========================================
// ADMIN ROUTES
// ==========================================

// Get all slides (including inactive)
router.get("/admin/onboarding", requireAdmin, async (req: AuthRequest, res) => {
  try {
    const slides = await db
      .select()
      .from(onboardingSlidesTable)
      .orderBy(desc(onboardingSlidesTable.order));

    return res.json(slides);
  } catch (error) {
    console.error("Error fetching admin onboarding slides:", error);
    return res.status(500).json({ error: "Failed to fetch slides" });
  }
});

// Create a new slide
const createSlideSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().min(1, "Description is required"),
  imageUrl: z.string().min(1, "Image URL is required"),
  order: z.number().default(0),
  isActive: z.boolean().default(true),
});

router.post("/admin/onboarding", requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const data = createSlideSchema.parse(req.body);

    const [slide] = await db
      .insert(onboardingSlidesTable)
      .values(data)
      .returning();

    return res.status(201).json(slide);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error("Error creating slide:", error);
    return res.status(500).json({ error: "Failed to create slide" });
  }
});

// Update a slide
const updateSlideSchema = createSlideSchema.partial();

router.put("/admin/onboarding/:id", requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

    const data = updateSlideSchema.parse(req.body);

    const [slide] = await db
      .update(onboardingSlidesTable)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(onboardingSlidesTable.id, id))
      .returning();

    if (!slide) {
      return res.status(404).json({ error: "Slide not found" });
    }

    return res.json(slide);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error("Error updating slide:", error);
    return res.status(500).json({ error: "Failed to update slide" });
  }
});

// Delete a slide
router.delete("/admin/onboarding/:id", requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

    const [slide] = await db
      .delete(onboardingSlidesTable)
      .where(eq(onboardingSlidesTable.id, id))
      .returning();

    if (!slide) {
      return res.status(404).json({ error: "Slide not found" });
    }

    return res.json({ message: "Slide deleted successfully" });
  } catch (error) {
    console.error("Error deleting slide:", error);
    return res.status(500).json({ error: "Failed to delete slide" });
  }
});

export default router;
