import type { AssembledScrapedData, LatestReleaseInfo } from "./types";
import { and, eq, inArray } from "drizzle-orm";
import type { db } from "@myakiba/db/client";
import { entry, entry_to_item, item, item_release } from "@myakiba/db/schema/figure";

type CatalogTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function persistScrapedCatalog(
  tx: CatalogTransaction,
  assembledData: AssembledScrapedData,
): Promise<{
  externalIdToInternalId: ReadonlyMap<number, string>;
  latestReleaseIdByInternalId: ReadonlyMap<string, LatestReleaseInfo>;
}> {
  const { items, entries, entryToItems, itemReleases, latestReleaseIdByExternalId } = assembledData;

  if (items.length > 0) {
    await tx
      .insert(item)
      .values(items)
      .onConflictDoNothing({ target: [item.source, item.externalId] });
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

  if (entries.length > 0) {
    await tx
      .insert(entry)
      .values(entries)
      .onConflictDoNothing({ target: [entry.source, entry.externalId] });
  }

  const entryExternalIds = entries
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

  const entryToItemsToInsert = entryToItems
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
  for (const [externalId, releaseInfo] of latestReleaseIdByExternalId) {
    const internalItemId = externalIdToInternalId.get(externalId);
    if (internalItemId) {
      latestReleaseIdByInternalId.set(internalItemId, releaseInfo);
    }
  }

  return { externalIdToInternalId, latestReleaseIdByInternalId };
}
