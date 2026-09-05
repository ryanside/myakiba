import type { AssembledScrapedData, LatestReleaseInfo } from "./types";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { db } from "@myakiba/db/client";
import { entry, entry_to_item, item, item_release } from "@myakiba/db/schema/figure";

type ItemDataTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function persistScrapedItemData(
  tx: ItemDataTransaction,
  assembledData: AssembledScrapedData,
): Promise<{
  externalIdToInternalId: ReadonlyMap<number, string>;
  latestReleaseIdByInternalId: ReadonlyMap<string, LatestReleaseInfo>;
  insertedItemExternalIds: ReadonlySet<number>;
}> {
  const { items, entries, entryToItems, itemReleases } = assembledData;

  const insertedItemExternalIds = new Set<number>();
  if (items.length > 0) {
    const insertedItems = await tx
      .insert(item)
      .values(items)
      .onConflictDoNothing({ target: [item.source, item.externalId] })
      .returning({ externalId: item.externalId });
    for (const insertedItem of insertedItems) {
      if (insertedItem.externalId !== null) insertedItemExternalIds.add(insertedItem.externalId);
    }
  }

  const itemExternalIds = items
    .map((dbItem) => dbItem.externalId)
    .filter((externalId): externalId is number => externalId !== null);
  const dbItems =
    itemExternalIds.length > 0
      ? await tx
          .select({ id: item.id, externalId: item.externalId })
          .from(item)
          .where(and(eq(item.source, "mfc"), inArray(item.externalId, itemExternalIds)))
      : [];
  const externalIdToInternalId = new Map<number, string>(
    dbItems.flatMap((dbItem) =>
      dbItem.externalId === null ? [] : [[dbItem.externalId, dbItem.id]],
    ),
  );

  // Only the transaction that creates an Item supplies its details. A concurrent
  // sync reuses the existing Item, including its releases and entry links.
  const newEntryToItems = entryToItems.filter((link) =>
    insertedItemExternalIds.has(link.itemExternalId),
  );
  const newEntryExternalIds = new Set(newEntryToItems.map((link) => link.entryExternalId));
  const newEntries = entries.filter((dbEntry) => newEntryExternalIds.has(dbEntry.externalId));
  if (newEntries.length > 0) {
    await tx
      .insert(entry)
      .values(newEntries)
      .onConflictDoNothing({ target: [entry.source, entry.externalId] });
  }

  const entryExternalIds = newEntries
    .map((dbEntry) => dbEntry.externalId)
    .filter((externalId): externalId is number => externalId !== null);
  const dbEntries =
    entryExternalIds.length > 0
      ? await tx
          .select({ id: entry.id, externalId: entry.externalId })
          .from(entry)
          .where(and(eq(entry.source, "mfc"), inArray(entry.externalId, entryExternalIds)))
      : [];
  const externalIdToEntryId = new Map<number, string>(
    dbEntries.flatMap((dbEntry) =>
      dbEntry.externalId === null ? [] : [[dbEntry.externalId, dbEntry.id]],
    ),
  );

  const itemReleasesToInsert = itemReleases
    .filter((release) => insertedItemExternalIds.has(release.itemExternalId))
    .map((release) => {
      const internalItemId = externalIdToInternalId.get(release.itemExternalId);
      if (!internalItemId) {
        return null;
      }
      return {
        id: release.id,
        itemId: internalItemId,
        date: release.date,
        type: release.type,
        price: release.price,
        priceCurrency: release.priceCurrency,
        barcode: release.barcode,
      };
    })
    .filter(
      (
        release,
      ): release is {
        id: string;
        itemId: string;
        date: string;
        type: string;
        price: number;
        priceCurrency: string;
        barcode: string;
      } => release !== null,
    );

  if (itemReleasesToInsert.length > 0) {
    await tx
      .insert(item_release)
      .values(itemReleasesToInsert)
      .onConflictDoNothing({ target: [item_release.id] });
  }

  const entryToItemsToInsert = newEntryToItems
    .map((link) => {
      const entryId = externalIdToEntryId.get(link.entryExternalId);
      const itemId = externalIdToInternalId.get(link.itemExternalId);
      if (!entryId || !itemId) {
        return null;
      }
      return {
        entryId,
        itemId,
        role: link.role,
      };
    })
    .filter(
      (
        link,
      ): link is {
        entryId: string;
        itemId: string;
        role: string;
      } => link !== null,
    );

  if (entryToItemsToInsert.length > 0) {
    await tx
      .insert(entry_to_item)
      .values(entryToItemsToInsert)
      .onConflictDoNothing({
        target: [entry_to_item.entryId, entry_to_item.itemId],
      });
  }

  const latestReleaseIdByInternalId = new Map<string, LatestReleaseInfo>();
  const internalItemIds = [...externalIdToInternalId.values()];
  if (internalItemIds.length > 0) {
    const releases = await tx
      .selectDistinctOn([item_release.itemId], {
        itemId: item_release.itemId,
        releaseId: item_release.id,
        date: item_release.date,
      })
      .from(item_release)
      .where(inArray(item_release.itemId, internalItemIds))
      .orderBy(
        item_release.itemId,
        desc(item_release.date),
        desc(item_release.createdAt),
        desc(item_release.id),
      );
    for (const release of releases) {
      latestReleaseIdByInternalId.set(release.itemId, {
        releaseId: release.releaseId,
        date: release.date,
      });
    }
  }

  return { externalIdToInternalId, latestReleaseIdByInternalId, insertedItemExternalIds };
}
