import { Hono } from "hono";
import type { Variables } from "../..";
import * as service from "./service";

export const dashboardRouter = new Hono<{
  Variables: Variables;
}>()
  .get("/summary", async (c) => {
    const user = c.get("user");
    if (!user) return c.text("Unauthorized", 401);

    const [collectionStats, ordersSummary, recentItems] = await Promise.all([
      service.getCollectionStats(user.id),
      service.getOrdersSummary(user.id),
      service.getRecentItems(user.id),
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
