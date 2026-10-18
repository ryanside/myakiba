import { privateApi } from "@/boundary/private-api";
import { serve } from "@/domain/kernel";
import { expenseFiltersSchema, expenseShopFiltersSchema, shopParamSchema } from "./model";
import { Expenses } from "./module";

const expensesRouter = privateApi("/expenses")
  .get("/filter-options", (ctx) => serve(ctx, Expenses.filterOptions, {}))
  .get("/collection", (ctx) => serve(ctx, Expenses.collection, ctx.query), {
    query: expenseFiltersSchema,
  })
  .get("/shops", (ctx) => serve(ctx, Expenses.shops, ctx.query), {
    query: expenseShopFiltersSchema,
  })
  .get("/orders", (ctx) => serve(ctx, Expenses.orders, ctx.query), {
    query: expenseFiltersSchema,
  })
  .get("/shipping", (ctx) => serve(ctx, Expenses.shipping, ctx.query), {
    query: expenseFiltersSchema,
  })
  .get(
    "/shops/:shop/expansion",
    (ctx) => serve(ctx, Expenses.shopExpansion, { shopId: ctx.params.shop, filters: ctx.query }),
    { params: shopParamSchema, query: expenseShopFiltersSchema },
  );

export default expensesRouter;
