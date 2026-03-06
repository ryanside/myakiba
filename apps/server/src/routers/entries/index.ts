import { Elysia, status } from "elysia";
import * as z from "zod";
import EntriesService from "./service";
import { tryCatch } from "@myakiba/utils";
import { evlog } from "@/middleware/evlog";

const entriesRouter = new Elysia({ prefix: "/entries" }).use(evlog).get(
  "/search",
  async ({ query, log }) => {
    log.set({ action: "entries.search", query: { search: query.search } });

    const { data: entries, error } = await tryCatch(EntriesService.getEntries(query.search));

    if (error) {
      log.error(error, { step: "get_entries" });
      log.set({ outcome: "error" });
      return status(500, "Failed to get entries");
    }

    log.set({ result: { count: entries.length }, outcome: "success" });
    return { entries };
  },
  { query: z.object({ search: z.string() }) },
);

export default entriesRouter;
