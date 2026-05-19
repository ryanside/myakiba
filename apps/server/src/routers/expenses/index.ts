import { tryCatch } from "@myakiba/utils/result";
import { Elysia, status } from "elysia";
import { evlog } from "evlog/elysia";
import { betterAuth } from "@/middleware/better-auth";
import {
  expenseFiltersSchema,
  expenseShopsFiltersSchema,
  shopExpansionQuerySchema,
  shopParamSchema,
} from "./model";
import ExpensesService from "./service";

const expensesRouter = new Elysia({ prefix: "/expenses" })
  .use(betterAuth)
  .use(evlog())
  .get(
    "/",
    async ({ query, user, log }) => {
      if (!user) return status(401, "Unauthorized");

      log.set({ action: "get_expenses_overview", user: { id: user.id }, query });

      const { data, error } = await tryCatch(ExpensesService.getExpensesOverview(user.id, query));

      if (error) {
        log.error(error, { step: "getExpensesOverview" });
        log.set({ outcome: "error" });
        return status(500, "Failed to get expenses overview");
      }

      log.set({ outcome: "success" });
      return data;
    },
    { query: expenseFiltersSchema, auth: true },
  )
  .get(
    "/shops",
    async ({ query, user, log }) => {
      if (!user) return status(401, "Unauthorized");

      log.set({ action: "get_expenses_shops", user: { id: user.id }, query });

      const { data, error } = await tryCatch(ExpensesService.getShopsBreakdown(user.id, query));

      if (error) {
        log.error(error, { step: "getShopsBreakdown" });
        log.set({ outcome: "error" });
        return status(500, "Failed to get shops breakdown");
      }

      log.set({ outcome: "success" });
      return data;
    },
    { query: expenseShopsFiltersSchema, auth: true },
  )
  .get(
    "/shops/:shop/expansion",
    async ({ params, query, user, log }) => {
      if (!user) return status(401, "Unauthorized");

      log.set({
        action: "get_shop_expansion",
        user: { id: user.id },
        shop: params.shop,
        query,
      });

      const { data, error } = await tryCatch(
        ExpensesService.getShopExpansion(user.id, params.shop, query),
      );

      if (error) {
        log.error(error, { step: "getShopExpansion" });
        log.set({ outcome: "error" });
        return status(500, "Failed to get shop expansion");
      }

      log.set({ outcome: "success" });
      return data;
    },
    {
      params: shopParamSchema,
      query: shopExpansionQuerySchema,
      auth: true,
    },
  );

export default expensesRouter;
