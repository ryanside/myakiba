import type {
  scrapedItem,
  UpdatedSyncOrder,
  UpdatedSyncOrderItem,
} from "../types";
import Redis from "ioredis";
import type { jobData } from "../types";
import { normalizeDateString } from "../utils";
import { v5 as uuidv5 } from "uuid";
import { db } from "@myakiba/db";
import { setJobStatus } from "../utils";
import {
  item,
  item_release,
  entry,
  entry_to_item,
  order,
  collection,
} from "@myakiba/db/schema/figure";

export async function finalizeOrderSync(
  successfulResults: scrapedItem[],
  job: jobData,
  redis: Redis,
  details: UpdatedSyncOrder,
  itemsToScrape: UpdatedSyncOrderItem[],
  itemsToInsert: UpdatedSyncOrderItem[]
) {
  const items = successfulResults.map((item) => ({
    id: item.id,
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
    itemId: number;
    date: string;
    type: string;
    price: string;
    priceCurrency: string;
    barcode: string;
  }> = [];
  const entries: Array<{
    id: number;
    category: string;
    name: string;
  }> = [];
  const entryToItems: Array<{
    entryId: number;
    itemId: number;
    role: string;
  }> = [];
  const latestReleaseIdByItem: Map<
    number,
    { releaseId: string | null; date: string | null }
  > = new Map();
  const successfulOrderItems = itemsToScrape.filter((item) =>
    successfulResults.some((result) => result.id === item.itemId)
  );

  for (const scraped of successfulResults) {
    for (const classification of scraped.classification) {
      entryToItems.push({
        entryId: classification.id,
        itemId: scraped.id,
        role: classification.role,
      });
      entries.push({
        id: classification.id,
        category: "Classifications",
        name: classification.name,
      });
    }

    for (const origin of scraped.origin) {
      entryToItems.push({
        entryId: origin.id,
        itemId: scraped.id,
        role: "",
      });
      entries.push({
        id: origin.id,
        category: "Origins",
        name: origin.name,
      });
    }

    for (const character of scraped.character) {
      entryToItems.push({
        entryId: character.id,
        itemId: scraped.id,
        role: "",
      });
      entries.push({
        id: character.id,
        category: "Characters",
        name: character.name,
      });
    }

    for (const company of scraped.company) {
      entryToItems.push({
        entryId: company.id,
        itemId: scraped.id,
        role: company.role,
      });
      entries.push({
        id: company.id,
        category: "Companies",
        name: company.name,
      });
    }

    for (const artist of scraped.artist) {
      entryToItems.push({
        entryId: artist.id,
        itemId: scraped.id,
        role: artist.role,
      });
      entries.push({
        id: artist.id,
        category: "Artists",
        name: artist.name,
      });
    }

    for (const event of scraped.event) {
      entryToItems.push({
        entryId: event.id,
        itemId: scraped.id,
        role: event.role,
      });
      entries.push({
        id: event.id,
        category: "Events",
        name: event.name,
      });
    }

    for (const material of scraped.materials) {
      entryToItems.push({
        entryId: material.id,
        itemId: scraped.id,
        role: "",
      });
      entries.push({
        id: material.id,
        category: "Materials",
        name: material.name,
      });
    }

    const releasesForItem = scraped.releaseDate.map((release) => {
      const normalizedDate = normalizeDateString(release.date);
      return {
        id: uuidv5(
          `${scraped.id}-${normalizedDate}-${release.type}-${release.price}-${release.priceCurrency}-${release.barcode}`,
          "2c8ed313-3f54-4401-a280-2410ce639ef3"
        ),
        itemId: scraped.id,
        date: normalizedDate,
        type: release.type,
        price: release.price.toString(),
        priceCurrency: release.priceCurrency,
        barcode: release.barcode,
      };
    });

    if (releasesForItem.length > 0) {
      const latest = [...releasesForItem].sort((a, b) =>
        a.date.localeCompare(b.date)
      )[releasesForItem.length - 1];
      latestReleaseIdByItem.set(scraped.id, {
        releaseId: latest.id,
        date: latest.date,
      });
    } else {
      latestReleaseIdByItem.set(scraped.id, {
        releaseId: "",
        date: "",
      });
    }

    itemReleases.push(...releasesForItem);
  }

  // assign latest release id to successfulOrderItems
  successfulOrderItems.forEach((item) => {
    item.releaseId = latestReleaseIdByItem.get(item.itemId)?.releaseId ?? "";
  });

  // determine the latest release date from latestReleaseIdByItem
  const latestReleaseDate = [...latestReleaseIdByItem.values()].sort(
    (a, b) => a.date?.localeCompare(b.date ?? "") ?? 0
  )[latestReleaseIdByItem.size - 1].date;

  // compare current order.releaseMonthYear with latestReleaseDate
  // if latestReleaseDate is after order.releaseMonthYear, update order.releaseMonthYear
  if (
    latestReleaseDate &&
    (!details.releaseMonthYear || latestReleaseDate > details.releaseMonthYear)
  ) {
    details.releaseMonthYear = latestReleaseDate;
  }

  const orderItems = [...itemsToInsert, ...successfulOrderItems];

  try {
    await db.transaction(async (tx) => {
      await tx
        .insert(item)
        .values(items)
        .onConflictDoNothing({ target: [item.id] });
      if (itemReleases.length > 0) {
        await tx
          .insert(item_release)
          .values(itemReleases)
          .onConflictDoNothing({ target: [item_release.id] });
      }
      if (entries.length > 0) {
        await tx
          .insert(entry)
          .values(entries)
          .onConflictDoNothing({ target: [entry.id] });
      }
      if (entryToItems.length > 0) {
        await tx
          .insert(entry_to_item)
          .values(entryToItems)
          .onConflictDoNothing({
            target: [entry_to_item.entryId, entry_to_item.itemId],
          });
      }
      await tx.insert(order).values(details);
      await tx.insert(collection).values(orderItems);
    });
  } catch (error) {
    await setJobStatus(
      redis,
      job.id!,
      `Sync failed: Failed to insert items to database.`,
      true
    );
    console.error("Failed to insert data to database.", error);
    throw error;
  }

  await setJobStatus(
    redis,
    job.id!,
    `Sync completed: Synced ${successfulOrderItems.length + itemsToInsert.length} out of ${itemsToInsert.length + itemsToScrape.length} items`,
    true
  );
  return {
    status: "Sync Job completed",
    processedAt: new Date().toISOString(),
  };
}
