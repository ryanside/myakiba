import { Elysia, status } from "elysia";
import AnalyticsService from "./service";
import { tryCatch } from "@myakiba/utils";
import { betterAuth } from "@/middleware/better-auth";

const analyticsRouter = new Elysia({ prefix: "/analytics" }).use(betterAuth).get(
  "/",
  async ({ user }) => {
    if (!user) return status(401, "Unauthorized");

    const { data: analytics, error } = await tryCatch(AnalyticsService.getAnalytics(user.id));

    if (error) {
      console.error("Error fetching analytics:", error, {
        userId: user.id,
      });

      return status(500, "Failed to get analytics");
    }

    return { analytics };
  },
  { auth: true },
);

export default analyticsRouter;
