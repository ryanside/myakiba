import { listInputSchema } from "@myakiba/contracts/lists/schema";
import { positionOrderInputSchema } from "@myakiba/contracts/shared/position-order";
import { privateApi } from "@/boundary/private-api";
import { serve } from "@/domain/kernel";
import {
  listPageQuerySchema,
  listIdParamSchema,
  listOptionsForTargetsSchema,
  addTargetsToListsSchema,
  removeTargetsFromListSchema,
  removeListMembersSchema,
  deleteListsSchema,
} from "./model";
import { Lists } from "./module";

const listsRouter = privateApi("/lists")
  .get("/", (ctx) => serve(ctx, Lists.list, ctx.query), { query: listPageQuerySchema })
  .post("/", (ctx) => serve(ctx, Lists.create, ctx.body), { body: listInputSchema })
  .patch("/order", (ctx) => serve(ctx, Lists.move, ctx.body), { body: positionOrderInputSchema })
  .post("/targets/options", (ctx) => serve(ctx, Lists.targetOptions, ctx.body), {
    body: listOptionsForTargetsSchema,
  })
  .put("/targets", (ctx) => serve(ctx, Lists.addTargets, ctx.body), {
    body: addTargetsToListsSchema,
  })
  .delete("/targets", (ctx) => serve(ctx, Lists.removeTargets, ctx.body), {
    body: removeTargetsFromListSchema,
  })
  .get("/:listId", (ctx) => serve(ctx, Lists.get, ctx.params), { params: listIdParamSchema })
  .put("/:listId", (ctx) => serve(ctx, Lists.update, { ...ctx.params, list: ctx.body }), {
    params: listIdParamSchema,
    body: listInputSchema,
  })
  .delete("/", (ctx) => serve(ctx, Lists.remove, ctx.body), { body: deleteListsSchema })
  .delete(
    "/:listId/members",
    (ctx) => serve(ctx, Lists.removeMembers, { ...ctx.params, ...ctx.body }),
    { params: listIdParamSchema, body: removeListMembersSchema },
  )
  .get("/:listId/members", (ctx) => serve(ctx, Lists.members, { ...ctx.params, ...ctx.query }), {
    params: listIdParamSchema,
    query: listPageQuerySchema,
  })
  .patch(
    "/:listId/members/order",
    (ctx) => serve(ctx, Lists.moveMembers, { ...ctx.params, ...ctx.body }),
    { params: listIdParamSchema, body: positionOrderInputSchema },
  );

export default listsRouter;
