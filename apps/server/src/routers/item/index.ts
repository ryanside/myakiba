import { itemRefreshSchema } from "@myakiba/contracts/mfc-items/schema";
import { privateApi } from "@/boundary/private-api";
import { serve } from "@/domain/kernel";
import { rateLimit } from "@/middleware/rate-limit";
import { itemIdParamSchema, itemParamSchema } from "./model";
import { Items } from "./module";

const itemRouter = privateApi("/item")
  .use(rateLimit)
  .get("/:id/releases", (ctx) => serve(ctx, Items.releases, ctx.params), {
    params: itemIdParamSchema,
  })
  .get("/:id", (ctx) => serve(ctx, Items.get, ctx.params), { params: itemParamSchema })
  .get("/:id/orders", (ctx) => serve(ctx, Items.relatedOrders, ctx.params), {
    params: itemParamSchema,
  })
  .get("/:id/collection", (ctx) => serve(ctx, Items.relatedCollection, ctx.params), {
    params: itemParamSchema,
  })
  .get("/:id/resync-status", (ctx) => serve(ctx, Items.resyncStatus, ctx.params), {
    params: itemParamSchema,
  })
  .post("/:id/resync", (ctx) => serve(ctx, Items.resync, { ...ctx.params, ...ctx.body }), {
    params: itemParamSchema,
    body: itemRefreshSchema,
    rateLimit: "itemResync",
  });

export default itemRouter;
