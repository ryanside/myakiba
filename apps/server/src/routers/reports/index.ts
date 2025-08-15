import { Hono } from "hono";
import type { Variables } from "../..";
import * as service from "./service";

export const reportsRouter = new Hono<{
  Variables: Variables;
}>()
  .get("/price-distribution", async (c) => {
    const user = c.get("user");
    if (!user) return c.text("Unauthorized", 401);

    const currency = c.req.query("currency") || "JPY";
    const data = await service.getPriceRangeDistribution(user.id, currency);
    return c.json(data);
  })
  .get("/top-origins", async (c) => {
    const user = c.get("user");
    if (!user) return c.text("Unauthorized", 401);

    const limit = parseInt(c.req.query("limit") || "10");
    const data = await service.getTopCollectedOrigins(user.id, limit);
    return c.json(data);
  });
