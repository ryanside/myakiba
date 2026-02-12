import { Elysia, status } from "elysia";
import * as z from "zod";
import EntriesService from "./service";
import { tryCatch } from "@myakiba/utils";
import { requestContext } from "@/middleware/request-context";

const entriesRouter = new Elysia({ prefix: "/entries" }).use(requestContext).get(
  "/search",
  async ({ query, wideEvent }) => {
    wideEvent.set({ searchQuery: query.search });

    const { data: entries, error } = await tryCatch(EntriesService.getEntries(query.search));

    if (error) {
      wideEvent.set({ error, outcome: "error" });
      return status(500, "Failed to get entries");
    }

    wideEvent.set({ resultCount: entries.length, outcome: "success" });
    return { entries };
  },
  { query: z.object({ search: z.string() }) },
);

export default entriesRouter;
