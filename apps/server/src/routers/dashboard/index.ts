import { Elysia, status } from "elysia";
import { betterAuth } from "@/middleware/better-auth";
import { evlog } from "@/middleware/evlog";
import DashboardService from "./service";
import { tryCatch } from "@myakiba/utils";
import * as z from "zod";

const releaseCalendarQuerySchema = z.object({
  month: z.coerce.number(),
  year: z.coerce.number(),
});

const dashboardRouter = new Elysia({ prefix: "/dashboard" })
  .use(betterAuth)
  .use(evlog)
  .get(
    "/",
    async ({ user, log }) => {
      if (!user) return status(401, "Unauthorized");

      log.set({ action: "get_dashboard", user: { id: user.id } });

      const { data: dashboard, error } = await tryCatch(DashboardService.getDashboard(user.id));

      if (error) {
        log.error(error, { step: "getDashboard" });
        log.set({ outcome: "error" });
        return status(500, "Failed to get dashboard data");
      }

      log.set({ outcome: "success" });
      return dashboard;
    },
    { auth: true },
  )
  .get(
    "/release-calendar",
    async ({ query, user, log }) => {
      if (!user) return status(401, "Unauthorized");

      log.set({
        action: "get_release_calendar",
        user: { id: user.id },
        query: { month: query.month, year: query.year },
      });

      const { data: releaseCalendar, error } = await tryCatch(
        DashboardService.getReleaseCalendar(user.id, query.month, query.year),
      );

      if (error) {
        log.error(error, { step: "getReleaseCalendar" });
        log.set({ outcome: "error" });
        return status(500, "Failed to get release calendar data");
      }

      log.set({ outcome: "success" });
      return { releaseCalendar };
    },
    { query: releaseCalendarQuerySchema, auth: true },
  );

export default dashboardRouter;
