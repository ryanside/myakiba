import { fillItemsBodySchema } from "@myakiba/contracts/collection/fill";
import { privateApi } from "@/boundary/private-api";
import { serve } from "@/domain/kernel";
import {
  collectionQuerySchema,
  collectionParamSchema,
  collectionUpdateSchema,
  collectionDeleteSchema,
} from "./model";
import { Collection } from "./module";

const collectionRouter = privateApi("/collection")
  .get("/", (ctx) => serve(ctx, Collection.list, ctx.query), { query: collectionQuerySchema })
  .get("/:id", (ctx) => serve(ctx, Collection.get, ctx.params), { params: collectionParamSchema })
  .put("/fill", (ctx) => serve(ctx, Collection.fill, ctx.body), { body: fillItemsBodySchema })
  .put("/:id", (ctx) => serve(ctx, Collection.update, { id: ctx.params.id, update: ctx.body }), {
    body: collectionUpdateSchema,
    params: collectionParamSchema,
  })
  .delete("/:id", (ctx) => serve(ctx, Collection.remove, ctx.params), {
    params: collectionParamSchema,
  })
  .delete("/", (ctx) => serve(ctx, Collection.removeMany, ctx.body), {
    body: collectionDeleteSchema,
  });

export default collectionRouter;
