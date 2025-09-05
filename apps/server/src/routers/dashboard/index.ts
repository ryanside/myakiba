import { Hono } from "hono";
import type { Variables } from "../..";
import DashboardService from "./service";
import { tryCatch } from "@/lib/utils";

const dashboardRouter = new Hono<{
  Variables: Variables;
}>().get("/", async (c) => {
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
});

export default dashboardRouter;
