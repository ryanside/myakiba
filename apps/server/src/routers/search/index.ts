import { Hono } from "hono";
import type { Variables } from "../..";
import SearchService from "./service";
import { zValidator } from "@hono/zod-validator";
import * as z from "zod";
import { tryCatch } from "@/lib/utils";

const searchRouter = new Hono<{
  Variables: Variables;
}>().get(
  "/",
  zValidator("query", z.object({ search: z.string() }), (result, c) => {
    if (!result.success) {
      return c.text("Invalid request!", 400);
    }
  }),
  async (c) => {
    const user = c.get("user");
    if (!user) return c.text("Unauthorized", 401);

    const validatedQuery = c.req.valid("query");
    const { data: searchData, error } = await tryCatch(
      SearchService.getSearchResults(validatedQuery.search, user.id)
    );
    if (error) {
      console.error("Error searching:", error);
      return c.text("Failed to search", 500);
    }
    return c.json({ searchData });
  }
);

export default searchRouter;
