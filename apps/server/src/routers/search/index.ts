import {
  itemDatabaseSearchSchema,
  searchCommandQuerySchema,
  searchEntriesQuerySchema,
  searchOrdersQuerySchema,
} from "@myakiba/contracts/search/schema";
import { privateApi } from "@/boundary/private-api";
import { serve } from "@/domain/kernel";
import { Search } from "./module";

const searchRouter = privateApi("/search")
  .get("/command", (ctx) => serve(ctx, Search.command, ctx.query), {
    query: searchCommandQuerySchema,
  })
  .get("/items", (ctx) => serve(ctx, Search.items, ctx.query), { query: itemDatabaseSearchSchema })
  .get("/entries", (ctx) => serve(ctx, Search.entries, ctx.query), {
    query: searchEntriesQuerySchema,
  })
  .get("/orders", (ctx) => serve(ctx, Search.orders, ctx.query), {
    query: searchOrdersQuerySchema,
  });

export default searchRouter;
