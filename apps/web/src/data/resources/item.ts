import { Result } from "better-result";
import { requireExtension } from "@/lib/extension-gate";
import { PICTURE_QUOTA_FULL } from "@/lib/pick-failure";
import {
  getItem,
  getItemRelatedCollection,
  getItemRelatedOrders,
  getItemReleases,
} from "@/queries/item";
import { refreshResultFamilies } from "../catalog";
import { defineCommand, rootedRead, useResourceMutation } from "../client";
import { refreshFailureText, refreshItemWithExtension } from "../item-refresh";

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
};

function clearedReleasesText(cleared: number): string {
  return cleared === 1
    ? "Release date cleared on 1 item in your collection. Edit it to select a release."
    : `Release date cleared on ${cleared} items in your collection. Edit them to select a release.`;
}

export const refreshItemCommand = defineCommand({
  invalidates: refreshResultFamilies,
  persist: (externalId: number) => refreshItemWithExtension(externalId),
  successTitle: (_externalId, refreshed) => {
    if (refreshed.picture === "over_quota" || refreshed.selections.cleared > 0) return;
    return refreshed.saved === "refreshed"
      ? "Item details refreshed"
      : "Item details are up to date";
  },
  warningToast: (_externalId, { saved, picture, selections }) => {
    const overQuota = picture === "over_quota";
    if (!overQuota && selections.cleared === 0) return;
    const overQuotaTitle =
      saved === "refreshed"
        ? "Item details refreshed without the new picture"
        : "Item details are up to date, without the new picture";
    return {
      title: overQuota ? overQuotaTitle : "Item details refreshed",
      description: [
        ...(overQuota ? [`${PICTURE_QUOTA_FULL}.`] : []),
        ...(selections.cleared > 0 ? [clearedReleasesText(selections.cleared)] : []),
      ].join(" "),
    };
  },
  failureToast: (_externalId, failure) => ({
    title: "Failed to request item refresh",
    ...(failure && { description: refreshFailureText(failure) }),
  }),
});

/** Asks for the extension first, so a refused refresh writes nothing and shows the notice that says why. */
export function useRefreshItem() {
  const refresh = useResourceMutation(refreshItemCommand);
  const run = async (externalId: number) => {
    const ready = await requireExtension();
    if (ready.isErr()) return Result.err(ready.error);
    return refresh.run(externalId);
  };
  return { run, isPending: refresh.isPending } as const;
}
