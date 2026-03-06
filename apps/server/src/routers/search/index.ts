import { Elysia, status } from "elysia";
import SearchService from "./service";
import * as z from "zod";
import { tryCatch } from "@myakiba/utils";
import { betterAuth } from "@/middleware/better-auth";
import { evlog } from "@/middleware/evlog";

const searchRouter = new Elysia({ prefix: "/search" })
  .use(betterAuth)
  .use(evlog)
  .get(
    "/",
    async ({ query, user, log }) => {
      if (!user) return status(401, "Unauthorized");

      log.set({ action: "search", user: { id: user.id }, search: { query: query.search } });

      const { data: searchData, error } = await tryCatch(
        SearchService.getSearchResults(query.search, user.id),
      );

      if (error) {
        log.error(error, { step: "getSearchResults", outcome: "error" });
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
    { query: z.object({ search: z.string().min(1) }), auth: true },
  );

export default searchRouter;
