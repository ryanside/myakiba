import { keepPreviousData } from "@tanstack/react-query";
import type { ItemDatabaseSearch } from "@myakiba/contracts/search/schema";
import {
  getItemDatabaseItems,
  searchCommandResults,
  searchEntries,
  searchOrders,
} from "@/queries/search";
import { rootedInfiniteRead, rootedRead } from "../client";

const ENTRY_SEARCH_PAGE_SIZE = 20;
const ORDER_SEARCH_PAGE_SIZE = 20;

export const searches = {
  command: rootedRead("commandSearch", {
    key: (query: string) => ["app-command", "search", query.toLowerCase()] as const,
    load: searchCommandResults,
    staleTime: 30_000,
  }),
  itemDatabase: rootedRead("itemDatabase", {
    key: (params: ItemDatabaseSearch) => ["item-database-items", params] as const,
    load: getItemDatabaseItems,
    placeholderData: keepPreviousData,
  }),
  entries: rootedInfiniteRead("entries", {
    key: (entrySearch: string) => ["entries", entrySearch] as const,
    loadPage: (entrySearch, offset) =>
      searchEntries({ search: entrySearch, limit: ENTRY_SEARCH_PAGE_SIZE, offset }),
    nextOffset: (lastPage, _allPages, lastOffset) =>
      lastPage.entries.length < ENTRY_SEARCH_PAGE_SIZE
        ? undefined
        : lastOffset + ENTRY_SEARCH_PAGE_SIZE,
    staleTime: 1000 * 60 * 5,
    retry: false,
  }),
  /** The move form's order picker. */
  orders: rootedInfiniteRead("orders", {
    key: (title: string) => ["orderIdsAndTitles", title] as const,
    loadPage: (title, offset) => searchOrders({ title, limit: ORDER_SEARCH_PAGE_SIZE, offset }),
    nextOffset: (lastPage, _allPages, lastOffset) =>
      lastPage.orderIdsAndTitles.length < ORDER_SEARCH_PAGE_SIZE
        ? undefined
        : lastOffset + ORDER_SEARCH_PAGE_SIZE,
    staleTime: 1000 * 60 * 5,
    retry: false,
  }),
};
