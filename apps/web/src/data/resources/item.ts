import {
  getItem,
  getItemRelatedCollection,
  getItemRelatedOrders,
  getItemReleases,
  getResyncStatus,
} from "@/queries/item";
import { refreshResultFamilies } from "../catalog";
import { defineCommand, rootedRead, useResourceMutation } from "../client";
import { refreshFailureText, refreshItemWithExtension } from "../extension-run";
import { startImport } from "../start-import";

const cache = { staleTime: 1000 * 60 * 5, retry: false } as const;

export const items = {
  detail: rootedRead("item", {
    key: (externalId: number) => ["item", externalId] as const,
    load: getItem,
    ...cache,
  }),
  relatedOrders: rootedRead("item", {
    key: (externalId: number) => ["item", externalId, "itemRelatedOrders"] as const,
    load: getItemRelatedOrders,
    ...cache,
  }),
  relatedCollection: rootedRead("item", {
    key: (externalId: number) => ["item", externalId, "itemRelatedCollection"] as const,
    load: getItemRelatedCollection,
    ...cache,
  }),
  releases: rootedRead("releases", {
    key: (itemId: string) => ["itemReleases", itemId] as const,
    load: getItemReleases,
    ...cache,
  }),
  resyncStatus: rootedRead("item", {
    key: (externalId: number) => ["item", externalId, "resyncStatus"] as const,
    load: getResyncStatus,
    staleTime: 1000 * 30,
    retry: false,
  }),
};

export const refreshItemCommand = defineCommand({
  invalidates: refreshResultFamilies,
  failureRefetchKeys: (externalId: number) => [
    { queryKey: items.resyncStatus.key(externalId), exact: true },
  ],
  persist: (externalId: number) => refreshItemWithExtension(externalId),
  successTitle: (_externalId, refreshed) =>
    refreshed.saved === "refreshed" ? "Item details refreshed" : "Item details are up to date",
  failureToast: (_externalId, failure) => ({
    title: "Failed to request item refresh",
    ...(failure && { description: refreshFailureText(failure) }),
  }),
});

/** Refreshes an item through `startImport`, so a refused refresh asks the extension for nothing. */
export function useRefreshItem() {
  const refresh = useResourceMutation(refreshItemCommand);
  const run = (externalId: number) => startImport(() => refresh.run(externalId));
  return { run, isPending: refresh.isPending } as const;
}
