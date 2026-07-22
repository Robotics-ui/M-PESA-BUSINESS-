import { Router, type IRouter, type Request, type Response } from "express";
import { like } from "drizzle-orm";
import { db, systemSettingsTable } from "@workspace/db";

const router: IRouter = Router();

/**
 * GET /settings/public
 *
 * Returns all media_* system settings without requiring authentication.
 * Used by the Landing page and customer Dashboard to load admin-uploaded media.
 */
router.get("/settings/public", async (req: Request, res: Response) => {
  try {
    const settings = await db
      .select()
      .from(systemSettingsTable)
      .where(like(systemSettingsTable.key, "media_%"));

    const result: Record<string, string> = {};
    for (const s of settings) {
      if (s.value) result[s.key] = s.value;
    }
    res.json(result);
  } catch (error) {
    req.log.error({ err: error }, "Error fetching public settings");
    res.status(500).json({ error: "Failed to fetch settings" });
  }
});

export default router;
