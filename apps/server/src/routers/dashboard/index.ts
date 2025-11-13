import { Hono } from "hono";
import type { Variables } from "../..";
import DashboardService from "./service";
import { tryCatch } from "@/lib/utils";
import { zValidator } from "@hono/zod-validator";
import * as z from "zod";
const dashboardRouter = new Hono<{
  Variables: Variables;
}>()
  .get("/", async (c) => {
    const user = c.get("user");
    if (!user) return c.text("Unauthorized", 401);

    const { data: dashboard, error } = await tryCatch(
      DashboardService.getDashboard(user.id)
    );

    if (error) {
      console.error("Error fetching dashboard data:", error, {
        userId: user.id,
      });

      return c.text("Failed to get dashboard data", 500);
    }

    return c.json({ dashboard });
  })
  .get(
    "/release-calendar",
    zValidator(
      "query",
      z.object({
        month: z.coerce.number(),
        year: z.coerce.number(),
      }),
      (result, c) => {
        if (!result.success) {
          console.log(result.error);
          return c.text("Invalid request!", 400);
        }
      }
    ),
    async (c) => {
      const user = c.get("user");
      if (!user) return c.text("Unauthorized", 401);

      const validatedQuery = c.req.valid("query");

      const { data: releaseCalendar, error } = await tryCatch(
        DashboardService.getReleaseCalendar(
          user.id,
          validatedQuery.month,
          validatedQuery.year
        )
      );

      if (error) {
        console.error("Error fetching release calendar data:", error, {
          userId: user.id,
        });

        return c.text("Failed to get release calendar data", 500);
      }

      return c.json({ releaseCalendar });
    }
  );

export default dashboardRouter;
