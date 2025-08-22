import { Hono } from "hono";
import type { Variables } from "../..";
import DashboardService from "./service";

export const dashboardRouter = new Hono<{
  Variables: Variables;
}>()
  .get("/summary", async (c) => {
    const user = c.get("user");
    if (!user) return c.text("Unauthorized", 401);

    const [collectionStats, ordersSummary, recentItems] = await Promise.all([
      DashboardService.getCollectionStats(user.id),
      DashboardService.getOrdersSummary(user.id),
      DashboardService.getRecentItems(user.id),
    ]);

    return c.json({
      itemsSummary: collectionStats.itemsSummary,
      collectionMSRPSummary: collectionStats.msrpSummary,
      totalSpentSummary: collectionStats.spentSummary,
      ordersSummary,
      recentItems,
    });
  })
  .get("/upcoming", (c) => {
    const user = c.get("user");
    if (!user) return c.text("Unauthorized", 401);
    return c.json({ user });
  })
  .get("/recent", (c) => {
    const user = c.get("user");
    if (!user) return c.text("Unauthorized", 401);
    return c.json({ user });
  });
