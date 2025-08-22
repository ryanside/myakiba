import { Hono } from "hono";
import type { Variables } from "../..";
import ReportsService from "./service";

export const reportsRouter = new Hono<{
  Variables: Variables;
}>()
  .get("/price-distribution", async (c) => {
    const user = c.get("user");
    if (!user) return c.text("Unauthorized", 401);

    const data = await ReportsService.getPriceRangeDistribution(user.id);
    return c.json(data);
  })
  .get("/top-collected", async (c) => {
    const user = c.get("user");
    if (!user) return c.text("Unauthorized", 401);

    const limit = parseInt(c.req.query("limit") || "10");
    const data = await ReportsService.getTopCollectedEntries(user.id, limit);
    return c.json(data);
  })
  .get("/scale-distribution", async (c) => {
    const user = c.get("user");
    if (!user) return c.text("Unauthorized", 401);
    const limit = parseInt(c.req.query("limit") || "10");
    const data = await ReportsService.getScaleDistribution(user.id);
    return c.json(data);
  })
  .get("/average-entry-price", async (c) => {
    const user = c.get("user");
    if (!user) return c.text("Unauthorized", 401);
    const entryCategory = c.req.query("entryCategory") || "Companies";
    const data = await ReportsService.getAverageEntryPrice(
      user.id,
      entryCategory
    );
    return c.json(data);
  });
