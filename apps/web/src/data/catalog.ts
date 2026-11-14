import type { QueryKey } from "@tanstack/react-query";

type FamilySpec =
  | {
      readonly kind: "persisted";
      readonly roots: readonly string[];
      readonly collectionWrites: boolean;
    }
  | { readonly kind: "live" | "account" | "static"; readonly roots: readonly string[] };

/**
 * Every query family the web app caches. A persisted family refreshes after every
 * Item Refresh. `roots` lists the roots of the family's hand-built keys, so an Item
 * Refresh and the family's writes refresh them.
 */
const catalog = {
  analytics: { kind: "persisted", roots: ["analytics"], collectionWrites: true },
  calendar: { kind: "persisted", roots: ["calendar", "releaseCalendar"], collectionWrites: true },
  collection: { kind: "persisted", roots: ["collection"], collectionWrites: true },
  commandSearch: { kind: "persisted", roots: ["app-command"], collectionWrites: true },
  dashboard: { kind: "persisted", roots: ["dashboard"], collectionWrites: true },
  entries: { kind: "persisted", roots: ["entries"], collectionWrites: false },
  expenses: { kind: "persisted", roots: ["expenses"], collectionWrites: true },
  item: { kind: "persisted", roots: ["item"], collectionWrites: true },
  itemDatabase: { kind: "persisted", roots: ["item-database-items"], collectionWrites: true },
  lists: { kind: "persisted", roots: ["lists"], collectionWrites: true },
  orders: {
    kind: "persisted",
    roots: ["order", "orders", "orderItems", "orderItemReleases", "orderIdsAndTitles"],
    collectionWrites: true,
  },
  releases: { kind: "persisted", roots: ["itemReleases"], collectionWrites: false },
  vocabulary: { kind: "persisted", roots: ["vocabulary"], collectionWrites: true },
  wishlist: { kind: "persisted", roots: [], collectionWrites: false },
  accountType: { kind: "account", roots: ["account-type"] },
  devices: { kind: "account", roots: ["devices"] },
  linkedAccounts: { kind: "account", roots: ["linked-accounts"] },
  usernameAvailability: { kind: "live", roots: ["username-availability"] },
  version: { kind: "static", roots: ["version"] },
} as const satisfies Record<string, FamilySpec>;

export type Family = keyof typeof catalog;
export type RootOf<F extends Family> = (typeof catalog)[F]["roots"][number];
export type PersistedFamily = {
  [F in Family]: (typeof catalog)[F]["kind"] extends "persisted" ? F : never;
}[Family];

/** Families a write can refetch: the persisted data, the account's own lists and live reads. */
export type WritableFamily = {
  [F in Family]: (typeof catalog)[F]["kind"] extends "persisted" | "account" | "live" ? F : never;
}[Family];

const isPersisted = (family: Family): family is PersistedFamily =>
  catalog[family].kind === "persisted";

export type Families = readonly [PersistedFamily, ...PersistedFamily[]];

function nonEmpty(families: readonly PersistedFamily[]): Families {
  const [first, ...rest] = families;
  if (first === undefined) throw new Error("No cataloged family matches");
  return [first, ...rest];
}

export const refreshResultFamilies = nonEmpty(
  (Object.keys(catalog) as Family[]).filter(isPersisted),
);

/** Every family a collection or order write can change. Each such write refreshes all of them. */
export const collectionWriteFamilies = nonEmpty(
  refreshResultFamilies.filter((family) => catalog[family].collectionWrites),
);

/** Matches a resource key `["resource", family, ...]` or a hand-built key under one of the family's roots. */
export function inFamilies(queryKey: QueryKey, families: readonly Family[]): boolean {
  const [root, family] = queryKey;
  return families.some((candidate) =>
    root === "resource"
      ? family === candidate
      : (catalog[candidate].roots as readonly unknown[]).includes(root),
  );
}
