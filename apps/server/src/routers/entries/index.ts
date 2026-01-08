import { Hono } from "hono";
import type { Variables } from "hono/types";
import * as z from "zod";
import { zValidator } from "@hono/zod-validator";
import EntriesService from "./service";
import { tryCatch } from "@myakiba/utils";

const entriesRouter = new Hono<{
  Variables: Variables;
}>().get(
  "/search",
  zValidator(
    "query",
    z.object({
      search: z.string(),
    }),
    (result, c) => {
      if (!result.success) {
        console.error(result.error);
        return c.text("Invalid request!", 400);
      }
    }
  ),
  async (c) => {
    const { search } = c.req.valid("query");

    const { data: entries, error } = await tryCatch(
      EntriesService.getEntries(search)
    );

    if (error) {
      console.error("Error fetching entries:", error);
      return c.text("Failed to get entries", 500);
    }

    return c.json({ entries });
  }
);

export default entriesRouter;
