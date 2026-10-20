import * as z from "zod";
import {
  cascadeOptionsSchema,
  newOrderSchema,
  orderItemsQuerySchema,
} from "@myakiba/contracts/orders/schema";
import { privateApi } from "@/boundary/private-api";
import { serve } from "@/domain/kernel";
import { orderUpdateSchema, ordersQuerySchema, orderIdParamSchema } from "./model";
import { Orders } from "./module";

const ordersRouter = privateApi("/orders")
  .get("/", (ctx) => serve(ctx, Orders.list, ctx.query), { query: ordersQuerySchema })
  .get("/:orderId", (ctx) => serve(ctx, Orders.get, ctx.params), { params: orderIdParamSchema })
  .get("/:orderId/items", (ctx) => serve(ctx, Orders.items, { ...ctx.params, ...ctx.query }), {
    params: orderIdParamSchema,
    query: orderItemsQuerySchema,
  })
  .get("/:orderId/item-releases", (ctx) => serve(ctx, Orders.itemReleases, ctx.params), {
    params: orderIdParamSchema,
  })
  .post("/merge", (ctx) => serve(ctx, Orders.merge, ctx.body), {
    body: z.object({
      orderIds: z.array(z.string()),
      newOrder: newOrderSchema,
      cascadeOptions: cascadeOptionsSchema,
    }),
  })
  .post("/split", (ctx) => serve(ctx, Orders.split, ctx.body), {
    body: z.object({
      collectionIds: z.array(z.string()),
      newOrder: newOrderSchema,
      cascadeOptions: cascadeOptionsSchema,
    }),
  })
  .put("/move-items", (ctx) => serve(ctx, Orders.moveItems, ctx.body), {
    body: z.object({
      targetOrderId: z.string(),
      collectionIds: z.array(z.string()),
      orderIds: z.array(z.string()).optional(),
    }),
  })
  .put("/:orderId", (ctx) => serve(ctx, Orders.update, { ...ctx.params, ...ctx.body }), {
    params: orderIdParamSchema,
    body: z.object({
      order: orderUpdateSchema,
      cascadeOptions: cascadeOptionsSchema,
    }),
  })
  .delete("/", (ctx) => serve(ctx, Orders.remove, ctx.body), {
    body: z.object({ orderIds: z.array(z.string()) }),
  })
  .delete("/items", (ctx) => serve(ctx, Orders.removeItems, ctx.body), {
    body: z.object({ collectionIds: z.array(z.string()) }),
  })
  .delete("/:orderId/items/:collectionId", (ctx) => serve(ctx, Orders.removeItem, ctx.params), {
    params: z.object({ orderId: z.string(), collectionId: z.string() }),
  });

export default ordersRouter;
