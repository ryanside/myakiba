import { tryCatch } from "@myakiba/utils/result";
import { Elysia, status } from "elysia";
import { evlog } from "evlog/elysia";
import { betterAuth } from "@/middleware/better-auth";
import { expenseFiltersSchema, expenseShopFiltersSchema, shopParamSchema } from "./model";
import ExpensesService from "./service";

const expensesRouter = new Elysia({ prefix: "/expenses" })
  .use(betterAuth)
  .use(evlog())
  .get(
    "/filter-options",
    async ({ user, log }) => {
      log.set({ action: "get_expense_filter_options", user: { id: user.id } });

      const { data, error } = await tryCatch(ExpensesService.getExpenseFilterOptions(user.id));

      if (error) {
        log.error(error, { step: "getExpenseFilterOptions" });
        log.set({ outcome: "error" });
        return status(500, "Failed to get expense filter options");
      }

      log.set({ outcome: "success" });
      return data;
    },
    { auth: true },
  )
  .get(
    "/overview",
    async ({ query, user, log }) => {
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
      log.set({ action: "get_expenses_shops", user: { id: user.id }, query });

      const { data, error } = await tryCatch(ExpensesService.getExpensesShops(user.id, query));

      if (error) {
        log.error(error, { step: "getExpensesShops" });
        log.set({ outcome: "error" });
        return status(500, "Failed to get expense shops");
      }

      log.set({ outcome: "success" });
      return data;
    },
    { query: expenseShopFiltersSchema, auth: true },
  )
  .get(
    "/trends",
    async ({ query, user, log }) => {
      log.set({ action: "get_expenses_trends", user: { id: user.id }, query });

      const { data, error } = await tryCatch(ExpensesService.getExpensesTrends(user.id, query));

      if (error) {
        log.error(error, { step: "getExpensesTrends" });
        log.set({ outcome: "error" });
        return status(500, "Failed to get expenses trends");
      }

      log.set({ outcome: "success" });
      return data;
    },
    { query: expenseFiltersSchema, auth: true },
  )
  .get(
    "/shipping",
    async ({ query, user, log }) => {
      log.set({ action: "get_expenses_shipping", user: { id: user.id }, query });

      const { data, error } = await tryCatch(ExpensesService.getExpensesShipping(user.id, query));

      if (error) {
        log.error(error, { step: "getExpensesShipping" });
        log.set({ outcome: "error" });
        return status(500, "Failed to get expenses shipping");
      }

      log.set({ outcome: "success" });
      return data;
    },
    { query: expenseFiltersSchema, auth: true },
  )
  .get(
    "/shops/:shop/expansion",
    async ({ params, query, user, log }) => {
      log.set({
        action: "get_expenses_shop_expansion",
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
    { params: shopParamSchema, query: expenseFiltersSchema, auth: true },
  );

export default expensesRouter;
