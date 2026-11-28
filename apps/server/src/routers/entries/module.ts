import { and, eq, inArray, sql } from "drizzle-orm";
import { collection, entry, entry_to_item, item, wishlistItem } from "@myakiba/db/schema/figure";
import type { ReadTx } from "@myakiba/db/tx";
import type { EntryItemState } from "@myakiba/contracts/entries/schema";
import { Result } from "better-result";
import { paginateBy, query } from "@/domain/kernel";
import { itemImageSql } from "@/lib/item-image-url";
import { ItemEntryNotFound } from "./errors/item-entry-not-found";

type EntryInput = { readonly entryId: string };

const COLLECTION_STATUSES = {
  owned: ["Owned"],
  ordered: ["Ordered", "Shipped"],
} as const;

function stateRows(tx: ReadTx, userId: string, entryId: string, state: EntryItemState) {
  const inEntry = inArray(
    item.id,
    tx
      .select({ itemId: entry_to_item.itemId })
      .from(entry_to_item)
      .where(and(eq(entry_to_item.entryId, entryId), eq(entry_to_item.ownerId, userId))),
  );
  const itemFields = {
    id: item.id,
    externalId: item.externalId,
    title: item.title,
    image: itemImageSql().as("image"),
  };

  if (state === "wishlist") {
    return tx
      .select({ rowId: sql<string>`${wishlistItem.id}`.as("row_id"), ...itemFields })
      .from(wishlistItem)
      .innerJoin(item, eq(wishlistItem.itemId, item.id))
      .where(and(eq(wishlistItem.userId, userId), inEntry))
      .as("entry_items");
  }

  return tx
    .select({ rowId: sql<string>`${collection.id}`.as("row_id"), ...itemFields })
    .from(collection)
    .innerJoin(item, eq(collection.itemId, item.id))
    .where(
      and(
        eq(collection.userId, userId),
        inArray(collection.status, [...COLLECTION_STATUSES[state]]),
        inEntry,
      ),
    )
    .as("entry_items");
}

export const Entries = {
  get: query(
    { action: "entries.get", failure: "Failed to load Item Entry" },
    async (scope, { entryId }: EntryInput) => {
      const [found] = await scope.tx
        .select({ id: entry.id, name: entry.name, category: entry.category })
        .from(entry)
        .where(and(eq(entry.id, entryId), eq(entry.ownerId, scope.viewer.userId)))
        .limit(1);
      if (!found) return Result.err(new ItemEntryNotFound());
      return Result.ok({ entry: found });
    },
  ),

  items: query(
    { action: "entries.items", failure: "Failed to load Item Entry items" },
    async (
      scope,
      input: EntryInput & {
        readonly state: EntryItemState;
        readonly limit: number;
        readonly offset: number;
      },
    ) => {
      scope.log.set({ entry: { id: input.entryId, state: input.state } });
      const rows = stateRows(scope.tx, scope.viewer.userId, input.entryId, input.state);
      const page = await paginateBy(scope, input, {
        select: { id: rows.id, externalId: rows.externalId, title: rows.title, image: rows.image },
        rows: (fields) => scope.tx.select(fields).from(rows).$dynamic(),
        orderBy: [
          [sql`LOWER(${rows.title})`, "asc"],
          [rows.rowId, "asc"],
        ],
      });
      return Result.ok(page);
    },
  ),
};
