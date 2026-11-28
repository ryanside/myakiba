import { keepPreviousData } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { ENTRY_ITEMS_PAGE_SIZE, entryItemStateSchema } from "@myakiba/contracts/entries/schema";
import type { EntryItemState } from "@myakiba/contracts/entries/schema";
import { getEntryItems, getItemEntry } from "@/queries/entries";
import type { EntryItemsInput } from "@/queries/entries";
import { preload, preloadPage, rootedRead } from "../client";

const detailKey = (entryId: string) => ["item-entry", entryId] as const;

/** The input of one state's page of an Item Entry's Items, shared by the loader and the screen. */
export function entryItemsInput(
  entryId: string,
  state: EntryItemState,
  offset = 0,
): EntryItemsInput {
  return { entryId, state, limit: ENTRY_ITEMS_PAGE_SIZE, offset };
}

export const itemEntries = {
  detail: rootedRead("itemEntry", {
    key: detailKey,
    load: getItemEntry,
    staleTime: 30_000,
    retry: false,
  }),
  items: rootedRead("itemEntry", {
    key: ({ entryId, state, limit, offset }: EntryItemsInput) =>
      [...detailKey(entryId), "items", state, limit, offset] as const,
    load: getEntryItems,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  }),
};

/** The Item Entry page's loader: its heading and each state's first page. */
export function preloadEntryPage(
  queryClient: QueryClient,
  cause: "preload" | "enter" | "stay",
  entryId: string,
): Promise<void> {
  return preloadPage(cause, () => [
    preload(queryClient, itemEntries.detail, entryId),
    ...entryItemStateSchema.options.map((state) =>
      preload(queryClient, itemEntries.items, entryItemsInput(entryId, state)),
    ),
  ]);
}
