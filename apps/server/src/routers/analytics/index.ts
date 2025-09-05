import { Hono } from "hono";
import type { Variables } from "../..";
import AnalyticsService from "./service";
import { tryCatch } from "@/lib/utils";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

const analyticsRouter = new Hono<{
  Variables: Variables;
}>()
  .get("/", async (c) => {
    const user = c.get("user");
    if (!user) return c.text("Unauthorized", 401);

    const { data: analytics, error } = await tryCatch(
      AnalyticsService.getAnalytics(user.id)
    );

    if (error) {
      console.error("Error fetching analytics:", error, {
        userId: user.id,
      });

      return c.text("Failed to get analytics", 500);
    }

    return c.json({ analytics });
  })
  .get(
    "/:entryCategory",
    zValidator(
      "param",
      z.object({ entryCategory: z.string() }),
      (result, c) => {
        if (!result.success) {
          return c.text("Invalid request!", 400);
        }
      }
    ),
    async (c) => {
      const user = c.get("user");
      if (!user) return c.text("Unauthorized", 401);

      const validatedParam = c.req.valid("param");

      const { data: entryAnalytics, error } = await tryCatch(
        AnalyticsService.getEntryAnalytics(
          user.id,
          validatedParam.entryCategory
        )
      );

      if (error) {
        console.error("Error fetching entry analytics:", error, {
          userId: user.id,
          entryCategory: validatedParam.entryCategory,
        });

        return c.text("Failed to get entry analytics", 500);
      }

      return c.json({ entryAnalytics });
    }
  );

export default analyticsRouter;
