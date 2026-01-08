import { Hono } from "hono";
import type { Variables } from "../..";
import AnalyticsService from "./service";
import { tryCatch } from "@myakiba/utils";

const analyticsRouter = new Hono<{
  Variables: Variables;
}>().get("/", async (c) => {
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
});

export default analyticsRouter;
