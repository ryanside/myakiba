import { db } from "@myakiba/db/client";
import { item, item_release, entry, entry_to_item, collection } from "@myakiba/db/schema/figure";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { assembleScrapedData } from "../../lib/assemble-scraped-data";
import type { ScrapedItem } from "../../lib/types";
import { buildReleasePlan } from "./release-plan";

/**
 * Updates an existing MFC item with freshly scraped data. This is a dedicated
 * refresh path that updates the item row in place and updates releases,
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

    const existingReleaseIds = (
      await tx
        .select({ id: item_release.id })
        .from(item_release)
        .where(eq(item_release.itemId, itemId))
    ).map((release) => release.id);

    const releasesToUpsert = assembled.itemReleases.map((release) => ({
      id: release.id,
      itemId,
      date: release.date,
      type: release.type,
      price: release.price,
      priceCurrency: release.priceCurrency,
      barcode: release.barcode,
    }));

    const releasePlan = buildReleasePlan({
      existingReleaseIds,
      scrapedReleaseIds: releasesToUpsert.map((release) => release.id),
    });

    if (releasesToUpsert.length > 0) {
      await tx
        .insert(item_release)
        .values(releasesToUpsert)
        .onConflictDoNothing({ target: [item_release.id] });
    }

    // Fresh releases must exist before we remap collection rows to them.
    switch (releasePlan.kind) {
      case "none":
        break;
      case "remap":
        await tx
          .update(collection)
          .set({
            releaseId: releasePlan.toReleaseId,
            updatedAt: new Date(),
          })
          .where(
            and(eq(collection.itemId, itemId), eq(collection.releaseId, releasePlan.fromReleaseId)),
          );
        break;
      case "clear":
        await tx
          .update(collection)
          .set({
            releaseId: null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(collection.itemId, itemId),
              isNotNull(collection.releaseId),
              inArray(collection.releaseId, releasePlan.staleReleaseIds),
            ),
          );
        break;
    }

    // After remap-or-clear, only the latest scraped release set should remain.
    if (releasePlan.staleReleaseIds.length > 0) {
      await tx
        .delete(item_release)
        .where(
          and(
            eq(item_release.itemId, itemId),
            inArray(item_release.id, releasePlan.staleReleaseIds),
          ),
        );
    }
  });
}
