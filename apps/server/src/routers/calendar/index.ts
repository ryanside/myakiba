import { privateApi } from "@/boundary/private-api";
import { serve } from "@/domain/kernel";
import { calendarQuerySchema } from "./model";
import { Calendar } from "./module";

const calendarRouter = privateApi("/calendar").get(
  "/",
  (ctx) =>
    ctx.query.view === "items"
      ? serve(ctx, Calendar.items, ctx.query)
      : serve(ctx, Calendar.orders, ctx.query),
  { query: calendarQuerySchema },
);

export default calendarRouter;
