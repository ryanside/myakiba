import { db } from "@myakiba/db/client";
import { item, item_release, entry, entry_to_item, collection } from "@myakiba/db/schema/figure";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { assembleScrapedData } from "../../lib/assemble-scraped-data";
import type { ScrapedItem } from "../../lib/types";

/**
 * Updates an existing MFC item with freshly scraped data. This is a dedicated
 * refresh path that updates the item row in place and reconciles releases,
 * entries, and entry-to-item links rather than using insert-only semantics.
 */
export async function refreshItemData(scrapedItem: ScrapedItem, itemId: string): Promise<void> {
  const assembled = assembleScrapedData([scrapedItem]);
  const assembledItem = assembled.items[0];

  await db.transaction(async (tx) => {
    const updatedItems = await tx
      .update(item)
      .set({
        title: assembledItem.title,
        category: assembledItem.category,
        version: assembledItem.version,
        scale: assembledItem.scale,
        height: assembledItem.height,
        width: assembledItem.width,
        depth: assembledItem.depth,
        image: assembledItem.image,
        updatedAt: new Date(),
      })
      .where(eq(item.id, itemId))
      .returning({ id: item.id });

    if (updatedItems.length === 0) {
      throw new Error("ITEM_NOT_FOUND_DURING_RESYNC");
    }

    if (assembled.entries.length > 0) {
      await tx
        .insert(entry)
        .values(assembled.entries)
        .onConflictDoNothing({ target: [entry.source, entry.externalId] });
    }

    const entryExternalIds = assembled.entries
      .map((e) => e.externalId)
      .filter((id): id is number => id !== null);
    const dbEntries =
      entryExternalIds.length > 0
        ? await tx
            .select({ id: entry.id, externalId: entry.externalId })
            .from(entry)
            .where(and(eq(entry.source, "mfc"), inArray(entry.externalId, entryExternalIds)))
        : [];
    const externalIdToEntryId = new Map(dbEntries.map((e) => [e.externalId, e.id]));

    await tx.delete(entry_to_item).where(eq(entry_to_item.itemId, itemId));

    const entryToItemLinks = assembled.entryToItems
      .map((link) => {
        const entryId = externalIdToEntryId.get(link.entryExternalId);
        if (!entryId) return null;
        return { entryId, itemId, role: link.role };
      })
      .filter((link): link is { entryId: string; itemId: string; role: string } => link !== null);

    if (entryToItemLinks.length > 0) {
      await tx
        .insert(entry_to_item)
        .values(entryToItemLinks)
        .onConflictDoNothing({ target: [entry_to_item.entryId, entry_to_item.itemId] });
    }

    const existingReleaseIds = await tx
      .select({ id: item_release.id })
      .from(item_release)
      .where(eq(item_release.itemId, itemId));
    const existingReleaseIdSet = new Set(existingReleaseIds.map((r) => r.id));

    const releasesToUpsert = assembled.itemReleases.map((release) => ({
      id: release.id,
      itemId,
      date: release.date,
      type: release.type,
      price: release.price,
      priceCurrency: release.priceCurrency,
      barcode: release.barcode,
    }));

    const newReleaseIdSet = new Set(releasesToUpsert.map((r) => r.id));
    const staleReleaseIds = [...existingReleaseIdSet].filter((id) => !newReleaseIdSet.has(id));

    if (staleReleaseIds.length > 0) {
      // Releases referenced by collection rows must be preserved so users
      // don't silently lose their chosen release (FK is onDelete: "set null").
      const referencedReleases = await tx
        .selectDistinct({ releaseId: collection.releaseId })
        .from(collection)
        .where(
          and(isNotNull(collection.releaseId), inArray(collection.releaseId, staleReleaseIds)),
        );
      const referencedIds = new Set(referencedReleases.map((r) => r.releaseId));
      const safeToDelete = staleReleaseIds.filter((id) => !referencedIds.has(id));

      if (safeToDelete.length > 0) {
        await tx
          .delete(item_release)
          .where(and(eq(item_release.itemId, itemId), inArray(item_release.id, safeToDelete)));
      }
    }

    if (releasesToUpsert.length > 0) {
      await tx
        .insert(item_release)
        .values(releasesToUpsert)
        .onConflictDoNothing({ target: [item_release.id] });
    }
  });
}
