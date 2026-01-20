import { Elysia, status } from "elysia";
import * as z from "zod";
import EntriesService from "./service";
import { tryCatch } from "@myakiba/utils";

const entriesRouter = new Elysia({ prefix: "/entries" }).get(
  "/search",
  async ({ query }) => {
    const { data: entries, error } = await tryCatch(
      EntriesService.getEntries(query.search)
    );

    if (error) {
      console.error("Error fetching entries:", error);
      return status(500, "Failed to get entries");
    }

    return { entries };
  },
  { query: z.object({ search: z.string() }) }
);

export default entriesRouter;
