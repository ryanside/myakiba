import { Elysia, status } from "elysia";
import AnalyticsService from "./service";
import { tryCatch } from "@myakiba/utils";
import { betterAuth } from "@/middleware/better-auth";
import { evlog } from "@/middleware/evlog";

const analyticsRouter = new Elysia({ prefix: "/analytics" })
  .use(betterAuth)
  .use(evlog)
  .get(
    "/",
    async ({ user, log }) => {
      if (!user) return status(401, "Unauthorized");

      log.set({ user: { id: user.id } });

      const { data: analytics, error } = await tryCatch(AnalyticsService.getAnalytics(user.id));

      if (error) {
        log.error(error, { step: "getAnalytics" });
        return status(500, "Failed to get analytics");
      }

      log.set({ outcome: "success" });
      return { analytics };
    },
    { auth: true },
  );

export default analyticsRouter;
