import { positionOrderInputSchema } from "@myakiba/contracts/shared/position-order";
import { privateApi } from "@/boundary/private-api";
import { serve } from "@/domain/kernel";
import { wishlistItemIdParamSchema, wishlistPageQuerySchema } from "./model";
import { Wishlist } from "./module";

const wishlistRouter = privateApi("/wishlist")
  .get("/", (ctx) => serve(ctx, Wishlist.list, ctx.query), { query: wishlistPageQuerySchema })
  .patch("/order", (ctx) => serve(ctx, Wishlist.move, ctx.body), {
    body: positionOrderInputSchema,
  })
  .put("/:itemId", (ctx) => serve(ctx, Wishlist.add, ctx.params), {
    params: wishlistItemIdParamSchema,
  })
  .delete("/:itemId", (ctx) => serve(ctx, Wishlist.remove, ctx.params), {
    params: wishlistItemIdParamSchema,
  });

export default wishlistRouter;
