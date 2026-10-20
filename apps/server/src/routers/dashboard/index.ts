import { privateApi } from "@/boundary/private-api";
import { serve } from "@/domain/kernel";
import { monthYearQuerySchema } from "./model";
import { Dashboard } from "./module";

const dashboardRouter = privateApi("/dashboard")
  .get("/", (ctx) => serve(ctx, Dashboard.overview, {}))
  .get("/release-calendar", (ctx) => serve(ctx, Dashboard.releaseCalendar, ctx.query), {
    query: monthYearQuerySchema,
  })
  .get("/monthly", (ctx) => serve(ctx, Dashboard.monthly, ctx.query), {
    query: monthYearQuerySchema,
  });

export default dashboardRouter;
