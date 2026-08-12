import { Elysia, status } from "elysia";
import SearchService from "./service";
import { tryCatch } from "@myakiba/utils/result";
import { betterAuth } from "@/middleware/better-auth";
import { evlog } from "evlog/elysia";
import {
  itemDatabaseSearchSchema,
  searchCommandQuerySchema,
  searchEntriesQuerySchema,
  searchOrdersQuerySchema,
} from "@myakiba/contracts/search/schema";

const searchRouter = new Elysia({ prefix: "/search" })
  .use(betterAuth)
  .use(evlog())
  .get(
    "/command",
    async ({ query, user, log }) => {
      log.set({
        action: "search.command",
        user: { id: user.id },
        search: { query: query.search },
      });

      const { data: searchData, error } = await tryCatch(
        SearchService.getCommandResults(query.search, user.id),
      );

      if (error) {
        log.error(error, { step: "getCommandResults" });
        log.set({ outcome: "error" });
        return status(500, "Failed to search");
      }

      log.set({
        search: {
          resultCount: searchData.collectionResults.length + searchData.orderResults.length,
          collectionCount: searchData.collectionResults.length,
          orderCount: searchData.orderResults.length,
        },
        outcome: "success",
      });
      return { searchData };
    },
    { query: searchCommandQuerySchema, auth: true },
  )
  .get(
    "/items",
    async ({ query, log }) => {
      log.set({
        action: "search.items",
        query: { search: query.query, page: query.page, pageSize: query.pageSize },
      });

      const { data: result, error } = await tryCatch(
        SearchService.getItemDatabaseItems(query.query, query.page, query.pageSize),
      );

      if (error) {
        log.error(error, { step: "getItemDatabaseItems", outcome: "error" });
        return status(500, "Failed to search item database");
      }

      log.set({
        result: { count: result.items.length, totalCount: result.totalCount },
        outcome: "success",
      });
      return result;
    },
    { query: itemDatabaseSearchSchema, auth: true },
  )
  .get(
    "/entries",
    async ({ query, log }) => {
      log.set({
        action: "search.entries",
        query: { search: query.search, limit: query.limit, offset: query.offset },
      });

      const { data: entries, error } = await tryCatch(
        SearchService.getEntries(query.search, query.limit, query.offset),
      );

      if (error) {
        log.error(error, { step: "getEntries", outcome: "error" });
        return status(500, "Failed to search entries");
      }

      log.set({ result: { count: entries.length }, outcome: "success" });
      return { entries };
    },
    { query: searchEntriesQuerySchema, auth: true },
  )
  .get(
    "/orders",
    async ({ query, user, log }) => {
      log.set({
        action: "search.orders",
        user: { id: user.id },
        query: { title: query.title, limit: query.limit, offset: query.offset },
      });

      const { data: result, error } = await tryCatch(
        SearchService.getOrderIdsAndTitles(user.id, query.title, query.limit, query.offset),
      );

      if (error) {
        log.error(error, { step: "getOrderIdsAndTitles", outcome: "error" });
        return status(500, "Failed to search orders");
      }

      log.set({ outcome: "success" });
      return { orderIdsAndTitles: result };
    },
    { query: searchOrdersQuerySchema, auth: true },
  );

export default searchRouter;
