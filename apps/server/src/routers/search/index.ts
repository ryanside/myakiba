import { Elysia, status } from "elysia";
import SearchService from "./service";
import * as z from "zod";
import { tryCatch } from "@myakiba/utils";
import { betterAuth } from "@/middleware/better-auth";
import { requestContext } from "@/middleware/request-context";

const searchRouter = new Elysia({ prefix: "/search" })
  .use(betterAuth)
  .use(requestContext)
  .get(
    "/",
    async ({ query, user, wideEvent }) => {
      if (!user) return status(401, "Unauthorized");

      wideEvent.set({ userId: user.id, searchQuery: query.search });

      const { data: searchData, error } = await tryCatch(
        SearchService.getSearchResults(query.search, user.id),
      );

      if (error) {
        wideEvent.set({ error, outcome: "error" });
        return status(500, "Failed to search");
      }

      wideEvent.set({ outcome: "success" });
      return { searchData };
    },
    { query: z.object({ search: z.string().min(1) }), auth: true },
  );

export default searchRouter;
