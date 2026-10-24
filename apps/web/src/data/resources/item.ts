import {
  getItem,
  getItemRelatedCollection,
  getItemRelatedOrders,
  getItemReleases,
  getResyncStatus,
} from "@/queries/item";
import { Result } from "better-result";
import { ItemRefreshFailed } from "@/lib/errors/item-refresh-failed";
import { syncResultFamilies } from "../catalog";
import { defineCommand, rootedRead } from "../client";
import { refreshItemWithExtension } from "../extension-run";

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
  invalidates: syncResultFamilies,
  failureRefetchKeys: (externalId: number) => [
    { queryKey: items.resyncStatus.key(externalId), exact: true },
  ],
  // The extension run still rejects with its reason. That rejection is this write's failure.
  persist: (externalId: number) =>
    Result.tryPromise({
      try: () => refreshItemWithExtension(externalId),
      catch: (cause) =>
        new ItemRefreshFailed({
          cause,
          message: cause instanceof Error ? cause.message : String(cause),
        }),
    }),
  successTitle: (_externalId, refreshed) =>
    refreshed.saved === "refreshed" ? "Item details refreshed" : "Item details are up to date",
  failureTitle: () => "Failed to request item refresh",
  failureDescription: (_externalId, error) => error.message,
});
