import {
  getItem,
  getItemRelatedCollection,
  getItemRelatedOrders,
  getItemReleases,
} from "@/queries/item";
import { rootedRead } from "../client";

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
