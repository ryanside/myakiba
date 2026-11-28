import { entryItemsQuerySchema } from "@myakiba/contracts/entries/schema";
import { privateApi } from "@/boundary/private-api";
import { serve } from "@/domain/kernel";
import { entryIdParamSchema } from "./model";
import { Entries } from "./module";

const entriesRouter = privateApi("/entries")
  .get("/:entryId", (ctx) => serve(ctx, Entries.get, ctx.params), { params: entryIdParamSchema })
  .get("/:entryId/items", (ctx) => serve(ctx, Entries.items, { ...ctx.params, ...ctx.query }), {
    params: entryIdParamSchema,
    query: entryItemsQuerySchema,
  });

export default entriesRouter;
