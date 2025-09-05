import { Hono } from "hono";
import type { Variables } from "../..";
import { zValidator } from "@hono/zod-validator";
import WrappedService from "./service";
import { wrappedQuerySchema } from "./model";
import { tryCatch } from "@/lib/utils";

const wrappedRouter = new Hono<{
  Variables: Variables;
}>().get(
  "/",
  zValidator("query", wrappedQuerySchema, (result, c) => {
    if (!result.success) {
      console.log(result.error);
      return c.text("Invalid request!", 400);
    }
  }),
  async (c) => {
    const user = c.get("user");
    if (!user) return c.text("Unauthorized", 401);

    const validatedQuery = c.req.valid("query");

    const { data: wrappedData, error: getWrappedStatsError } = await tryCatch(
      WrappedService.getWrappedStats(user.id, validatedQuery.year)
    );

    if (getWrappedStatsError) {
      console.error("Error fetching wrapped stats:", getWrappedStatsError, {
        userId: user.id,
        year: validatedQuery.year,
      });
      return c.text("Failed to get wrapped stats", 500);
    }

    return c.json({ wrapped: wrappedData });
  }
);

export default wrappedRouter;
