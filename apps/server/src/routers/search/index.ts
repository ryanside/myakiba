import { Elysia, status } from "elysia";
import SearchService from "./service";
import { tryCatch } from "@myakiba/utils/result";
import { betterAuth } from "@/middleware/better-auth";
import { evlog } from "evlog/elysia";
import {
  searchQuerySchema,
  searchReleasesQuerySchema,
  searchEntriesQuerySchema,
  searchOrdersQuerySchema,
} from "./model";

const searchRouter = new Elysia({ prefix: "/search" })
  .use(betterAuth)
  .use(evlog())
  .get(
    "/",
    async ({ query, user, log }) => {
      if (!user) {
        log.set({ outcome: "unauthorized" });
        return status(401, "Unauthorized");
      }

      log.set({ action: "search", user: { id: user.id }, search: { query: query.search } });

      const { data: searchData, error } = await tryCatch(
        SearchService.getSearchResults(query.search, user.id),
      );

      if (error) {
        log.error(error, { step: "getSearchResults" });
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
    { query: searchQuerySchema, auth: true },
  )
  .get(
    "/releases",
    async ({ query, log }) => {
      log.set({ action: "search.releases", item: { id: query.itemId } });

      const { data: result, error } = await tryCatch(SearchService.getReleases(query.itemId));

      if (error) {
        log.error(error, { step: "getReleases", outcome: "error" });
        return status(500, "Failed to get releases");
      }

      log.set({ result: { count: result.releases.length }, outcome: "success" });
      return result;
    },
    { query: searchReleasesQuerySchema },
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
    { query: searchEntriesQuerySchema },
  )
  .get(
    "/orders",
    async ({ query, user, log }) => {
      if (!user) return status(401, "Unauthorized");

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
