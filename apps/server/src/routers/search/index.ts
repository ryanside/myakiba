import { Elysia, status } from "elysia";
import SearchService from "./service";
import * as z from "zod";
import { tryCatch } from "@myakiba/utils";
import { betterAuth } from "@/middleware/better-auth";

const searchRouter = new Elysia({ prefix: "/search" })
  .use(betterAuth)
  .get(
    "/",
    async ({ query, user }) => {
      if (!user) return status(401, "Unauthorized");

      const { data: searchData, error } = await tryCatch(
        SearchService.getSearchResults(query.search, user.id)
      );

      if (error) {
        console.error("Error searching:", error, { userId: user.id });
        return status(500, "Failed to search");
      }

      return { searchData };
    },
    { query: z.object({ search: z.string().min(1) }), auth: true }
  );

export default searchRouter;
