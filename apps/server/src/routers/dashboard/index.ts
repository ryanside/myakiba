import { Elysia, status } from "elysia";
import { betterAuth } from "@/middleware/better-auth";
import { requestContext } from "@/middleware/request-context";
import DashboardService from "./service";
import { tryCatch } from "@myakiba/utils";
import * as z from "zod";

const releaseCalendarQuerySchema = z.object({
  month: z.coerce.number(),
  year: z.coerce.number(),
});

const dashboardRouter = new Elysia({ prefix: "/dashboard" })
  .use(betterAuth)
  .use(requestContext)
  .get(
    "/",
    async ({ user, wideEvent }) => {
      if (!user) return status(401, "Unauthorized");

      wideEvent.set({ userId: user.id });

      const { data: dashboard, error } = await tryCatch(DashboardService.getDashboard(user.id));

      if (error) {
        wideEvent.set({ error, outcome: "error" });
        return status(500, "Failed to get dashboard data");
      }

      wideEvent.set({ outcome: "success" });
      return dashboard;
    },
    { auth: true },
  )
  .get(
    "/release-calendar",
    async ({ query, user, wideEvent }) => {
      if (!user) return status(401, "Unauthorized");

      wideEvent.set({ userId: user.id, month: query.month, year: query.year });

      const { data: releaseCalendar, error } = await tryCatch(
        DashboardService.getReleaseCalendar(user.id, query.month, query.year),
      );

      if (error) {
        wideEvent.set({ error, outcome: "error" });
        return status(500, "Failed to get release calendar data");
      }

      wideEvent.set({ outcome: "success" });
      return { releaseCalendar };
    },
    { query: releaseCalendarQuerySchema, auth: true },
  );

export default dashboardRouter;
