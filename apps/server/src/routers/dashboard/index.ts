import { Elysia, status } from "elysia";
import { betterAuth } from "@/middleware/better-auth";
import DashboardService from "./service";
import { tryCatch } from "@myakiba/utils";
import * as z from "zod";

const releaseCalendarQuerySchema = z.object({
  month: z.coerce.number(),
  year: z.coerce.number(),
});

const dashboardRouter = new Elysia({ prefix: "/dashboard" })
  .use(betterAuth)
  .get(
    "/",
    async ({ user }) => {
      if (!user) return status(401, "Unauthorized");

      const { data: dashboard, error } = await tryCatch(
        DashboardService.getDashboard(user.id)
      );

      if (error) {
        console.error("Error fetching dashboard data:", error, {
          userId: user.id,
        });

        return status(500, "Failed to get dashboard data");
      }

      return dashboard;
    },
    { auth: true }
  )
  .get(
    "/release-calendar",
    async ({ query, user }) => {
      if (!user) return status(401, "Unauthorized");

      const { data: releaseCalendar, error } = await tryCatch(
        DashboardService.getReleaseCalendar(user.id, query.month, query.year)
      );

      if (error) {
        console.error("Error fetching release calendar data:", error, {
          userId: user.id,
        });

        return status(500, "Failed to get release calendar data");
      }

      return { releaseCalendar };
    },
    { query: releaseCalendarQuerySchema, auth: true }
  );

export default dashboardRouter;
