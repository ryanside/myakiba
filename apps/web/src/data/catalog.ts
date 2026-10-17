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
 * sync and import. `roots` lists the hand-built key roots a family keeps until it
 * moves into a resource module, so sync still refreshes them.
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
  itemDatabase: { kind: "persisted", roots: ["item-database-items"], collectionWrites: false },
  lists: { kind: "persisted", roots: ["lists"], collectionWrites: true },
  orders: {
    kind: "persisted",
    roots: ["order", "orders", "orderItems", "orderItemReleases", "orderIdsAndTitles"],
    collectionWrites: true,
  },
  releases: { kind: "persisted", roots: ["itemReleases"], collectionWrites: false },
  syncHistory: {
    kind: "persisted",
    roots: ["syncSessions", "syncSessionDetail"],
    collectionWrites: false,
  },
  wishlist: { kind: "persisted", roots: ["wishlist"], collectionWrites: false },
  accountType: { kind: "account", roots: ["account-type"] },
  currentImport: { kind: "live", roots: ["dataTransferImport"] },
  importStatus: { kind: "live", roots: ["dataTransferImportStatus"] },
  syncJobStatus: { kind: "live", roots: ["syncJobStatus"] },
  version: { kind: "static", roots: ["version"] },
} as const satisfies Record<string, FamilySpec>;

export type Family = keyof typeof catalog;
export type PersistedFamily = {
  [F in Family]: (typeof catalog)[F]["kind"] extends "persisted" ? F : never;
}[Family];

const isPersisted = (family: Family): family is PersistedFamily =>
  catalog[family].kind === "persisted";

export const syncResultFamilies: readonly PersistedFamily[] = (
  Object.keys(catalog) as Family[]
).filter(isPersisted);

export const collectionWriteFamilies: readonly PersistedFamily[] = syncResultFamilies.filter(
  (family) => catalog[family].collectionWrites,
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
