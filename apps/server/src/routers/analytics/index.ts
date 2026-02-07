import { Elysia, status } from "elysia";
import AnalyticsService from "./service";
import { tryCatch } from "@myakiba/utils";
import { betterAuth } from "@/middleware/better-auth";
import { requestContext } from "@/middleware/request-context";

const analyticsRouter = new Elysia({ prefix: "/analytics" })
  .use(betterAuth)
  .use(requestContext)
  .get(
    "/",
    async ({ user, wideEvent }) => {
      if (!user) return status(401, "Unauthorized");

      wideEvent.set({ userId: user.id });

      const { data: analytics, error } = await tryCatch(AnalyticsService.getAnalytics(user.id));

      if (error) {
        wideEvent.set({ error, outcome: "error" });
        return status(500, "Failed to get analytics");
      }

      wideEvent.set({ outcome: "success" });
      return { analytics };
    },
    { auth: true },
  );

export default analyticsRouter;
