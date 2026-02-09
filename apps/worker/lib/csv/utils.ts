import type { ShippingMethod } from "@myakiba/types";
import type { FinalizeCsvSyncParams } from "../types";
import { normalizeDateString } from "@myakiba/utils";
import { parseMoneyToMinorUnits } from "@myakiba/utils";
import { v5 as uuidv5 } from "uuid";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@myakiba/db";
import { setJobStatus, updateSyncSessionCounts } from "../utils";
import {
  item,
  item_release,
  entry,
  entry_to_item,
  order,
  collection,
} from "@myakiba/db/schema/figure";

export async function finalizeCsvSync({
  successfulResults,
  job,
  userId,
  redis,
  csvItems,
  syncSessionId,
}: FinalizeCsvSyncParams) {
  const items = successfulResults.map((item) => ({
    externalId: item.id,
    source: "mfc" as const,
    title: item.title,
    category: item.category,
    version: item.version,
    scale: item.scale,
    height: item.height,
    width: item.width,
    depth: item.depth,
    image: item.image,
  }));

  const itemReleases: Array<{
    id: string;
    itemExternalId: number;
    date: string;
    type: string;
    price: number;
    priceCurrency: string;
    barcode: string;
  }> = [];
  const entries: Array<{
    externalId: number;
    source: "mfc";
    category: string;
    name: string;
  }> = [];
  const entryToItems: Array<{
    entryExternalId: number;
    itemExternalId: number;
    role: string;
  }> = [];
  const latestReleaseIdByExternalId: Map<
    number,
    { releaseId: string | null; date: string | null }
  > = new Map();
  const successfulCollectionItems = csvItems.filter((i) =>
    successfulResults.some((result) => result.id === i.itemExternalId),
  );
  let collectionItems: Array<{
    userId: string;
    itemId: string | null;
    itemExternalId: number;
    status: "Owned" | "Ordered";
    count: number;
    score: string;
    paymentDate: string | null;
    shippingDate: string | null;
    collectionDate: string | null;
    price: number;
    shop: string;
    shippingMethod: ShippingMethod;
    notes: string;
    releaseId: string | null;
    orderId: string | null;
    orderDate: string | null;
  }> = [];
  let orders: Array<{
    id: string;
    userId: string;
    title: string;
    shop: string;
    orderDate: string | null;
    paymentDate: string | null;
    shippingDate: string | null;
    collectionDate: string | null;
    shippingMethod: ShippingMethod;
    releaseDate: string | null;
  }> = [];

  for (const scraped of successfulResults) {
    for (const classification of scraped.classification) {
      entryToItems.push({
        entryExternalId: classification.id,
        itemExternalId: scraped.id,
        role: classification.role,
      });
      entries.push({
        externalId: classification.id,
        source: "mfc",
        category: "Classifications",
        name: classification.name,
      });
    }

    for (const origin of scraped.origin) {
      entryToItems.push({
        entryExternalId: origin.id,
        itemExternalId: scraped.id,
        role: "",
      });
      entries.push({
        externalId: origin.id,
        source: "mfc",
        category: "Origins",
        name: origin.name,
      });
    }

    for (const character of scraped.character) {
      entryToItems.push({
        entryExternalId: character.id,
        itemExternalId: scraped.id,
        role: "",
      });
      entries.push({
        externalId: character.id,
        source: "mfc",
        category: "Characters",
        name: character.name,
      });
    }

    for (const company of scraped.company) {
      entryToItems.push({
        entryExternalId: company.id,
        itemExternalId: scraped.id,
        role: company.role,
      });
      entries.push({
        externalId: company.id,
        source: "mfc",
        category: "Companies",
        name: company.name,
      });
    }

    for (const artist of scraped.artist) {
      entryToItems.push({
        entryExternalId: artist.id,
        itemExternalId: scraped.id,
        role: artist.role,
      });
      entries.push({
        externalId: artist.id,
        source: "mfc",
        category: "Artists",
        name: artist.name,
      });
    }

    for (const event of scraped.event) {
      entryToItems.push({
        entryExternalId: event.id,
        itemExternalId: scraped.id,
        role: event.role,
      });
      entries.push({
        externalId: event.id,
        source: "mfc",
        category: "Events",
        name: event.name,
      });
    }

    for (const material of scraped.materials) {
      entryToItems.push({
        entryExternalId: material.id,
        itemExternalId: scraped.id,
        role: "",
      });
      entries.push({
        externalId: material.id,
        source: "mfc",
        category: "Materials",
        name: material.name,
      });
    }

    const releasesForItem = scraped.releaseDate.map((release) => {
      const normalizedDate = normalizeDateString(release.date);
      return {
        id: uuidv5(
          `${scraped.id}-${normalizedDate}-${release.type}-${release.price}-${release.priceCurrency}-${release.barcode}`,
          "2c8ed313-3f54-4401-a280-2410ce639ef3",
        ),
        itemExternalId: scraped.id,
        date: normalizedDate,
        type: release.type,
        price: release.price,
        priceCurrency: release.priceCurrency,
        barcode: release.barcode,
      };
    });

    if (releasesForItem.length > 0) {
      const latest = [...releasesForItem].sort((a, b) => a.date.localeCompare(b.date))[
        releasesForItem.length - 1
      ];
      latestReleaseIdByExternalId.set(scraped.id, {
        releaseId: latest.id,
        date: latest.date,
      });
    } else {
      latestReleaseIdByExternalId.set(scraped.id, {
        releaseId: null,
        date: null,
      });
    }

    itemReleases.push(...releasesForItem);
  }

  collectionItems = successfulCollectionItems.map((ci) => ({
    userId: userId,
    itemId: null,
    itemExternalId: ci.itemExternalId,
    status: ci.status as "Owned" | "Ordered",
    count: ci.count,
    score: ci.score && ci.score.trim() !== "" ? ci.score.toString() : "0.0",
    paymentDate: ci.payment_date,
    shippingDate: ci.shipping_date,
    collectionDate: ci.collecting_date,
    price: ci.price && ci.price.trim() !== "" ? parseMoneyToMinorUnits(ci.price) : 0,
    shop: ci.shop,
    shippingMethod: ci.shipping_method,
    notes: ci.note,
    releaseId: null,
    orderId: ci.orderId,
    orderDate: ci.orderDate,
  }));

  orders = successfulCollectionItems
    .filter((ci) => ci.orderId !== null)
    .map((ci) => ({
      id: ci.orderId!,
      userId: userId,
      title:
        successfulResults.find((result) => result.id === ci.itemExternalId)?.title ??
        `Order ${ci.orderId}`,
      shop: ci.shop,
      orderDate: ci.orderDate,
      paymentDate: ci.payment_date,
      shippingDate: ci.shipping_date,
      collectionDate: ci.collecting_date,
      shippingMethod: ci.shipping_method,
      releaseDate: latestReleaseIdByExternalId.get(ci.itemExternalId)?.date ?? null,
    }));

  console.log("Items to be inserted:", items);
  console.log("Releases to be inserted:", itemReleases);
  console.log("Entries to be inserted:", entries);
  console.log("Entry to Items to be inserted:", entryToItems);
  console.log("Collection Items to be inserted:", collectionItems);
  console.log("Orders to be inserted:", orders);

  try {
    await db.transaction(async (tx) => {
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
      const externalIdToInternalId = new Map(
        dbItems.map((dbItem) => [dbItem.externalId, dbItem.id]),
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
      const externalIdToEntryId = new Map(
        dbEntries.map((dbEntry) => [dbEntry.externalId, dbEntry.id]),
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

      const latestReleaseIdByInternalId = new Map<
        string,
        { releaseId: string | null; date: string | null }
      >();
      for (const [externalId, releaseInfo] of latestReleaseIdByExternalId) {
        const internalItemId = externalIdToInternalId.get(externalId);
        if (internalItemId) {
          latestReleaseIdByInternalId.set(internalItemId, releaseInfo);
        }
      }

      const collectionItemsToInsert: Array<typeof collection.$inferInsert> =
        collectionItems.flatMap((collectionItem) => {
          const internalItemId = externalIdToInternalId.get(collectionItem.itemExternalId);
          if (!internalItemId) {
            return [];
          }
          return [
            {
              userId: collectionItem.userId,
              itemId: internalItemId,
              orderId: collectionItem.orderId,
              status: collectionItem.status,
              count: collectionItem.count,
              score: collectionItem.score,
              paymentDate: collectionItem.paymentDate,
              shippingDate: collectionItem.shippingDate,
              collectionDate: collectionItem.collectionDate,
              price: collectionItem.price,
              shop: collectionItem.shop,
              shippingMethod: collectionItem.shippingMethod,
              notes: collectionItem.notes,
              releaseId: latestReleaseIdByInternalId.get(internalItemId)?.releaseId ?? null,
              orderDate: collectionItem.orderDate,
            },
          ];
        });

      if (orders.length > 0) {
        await tx.insert(order).values(orders);
      }
      await tx.insert(collection).values(collectionItemsToInsert);
    });

    console.log("Successfully inserted data to database.");
  } catch (error) {
    const uniqueItemCount = new Set(csvItems.map((i) => i.itemExternalId)).size;
    await setJobStatus({
      redis,
      jobId: job.id!,
      statusMessage: `Sync failed: Failed to insert items to database.`,
      finished: true,
      syncSessionId,
      sessionStatus: "failed",
    });
    await updateSyncSessionCounts({
      syncSessionId,
      successCount: successfulResults.length,
      failCount: uniqueItemCount - successfulResults.length,
    });
    console.error("Failed to insert data to database.", error);
    throw error;
  }

  const uniqueItemCount = new Set(csvItems.map((i) => i.itemExternalId)).size;
  const failCount = uniqueItemCount - successfulResults.length;
  const sessionStatus = failCount === 0 ? ("completed" as const) : ("partial" as const);

  await setJobStatus({
    redis,
    jobId: job.id!,
    statusMessage: `Sync completed: Synced ${successfulResults.length} out of ${uniqueItemCount} items`,
    finished: true,
    syncSessionId,
    sessionStatus,
  });
  await updateSyncSessionCounts({
    syncSessionId,
    successCount: successfulResults.length,
    failCount,
  });

  return {
    status: "Sync Job completed",
    processedAt: new Date().toISOString(),
  };
}
