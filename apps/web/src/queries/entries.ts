import { Result } from "better-result";
import type { EntryItemState } from "@myakiba/contracts/entries/schema";
import { call } from "@/data/api";
import { app } from "@/lib/treaty-client";

type EntryClient = ReturnType<typeof app.api.entries>;

export type EntryItemsData = NonNullable<Awaited<ReturnType<EntryClient["items"]["get"]>>["data"]>;

export function getItemEntry(entryId: string) {
  return call(app.api.entries({ entryId }).get(), {
    fallback: "Failed to load Item Entry",
    empty: "Failed to load Item Entry",
  }).then(Result.map((data) => data.entry));
}

export type EntryItemsInput = {
  readonly entryId: string;
  readonly state: EntryItemState;
  readonly limit: number;
  readonly offset: number;
};

export function getEntryItems({ entryId, state, limit, offset }: EntryItemsInput) {
  return call(app.api.entries({ entryId }).items.get({ query: { state, limit, offset } }), {
    fallback: "Failed to load Item Entry items",
    empty: "Failed to load Item Entry items",
  });
}
