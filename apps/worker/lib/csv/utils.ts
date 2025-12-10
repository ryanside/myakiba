import type { scrapedItem, CsvItem } from "../types";
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

export async function finalizeCsvSync(
  successfulResults: scrapedItem[],
  job: jobData,
  userId: string,
  redis: Redis,
  csvItems: CsvItem[]
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
  const successfulCollectionItems = csvItems.filter((i) =>
    successfulResults.some((result) => result.id === i.id)
  );
  let collectionItems: Array<{
    userId: string;
    itemId: number;
    status: "Owned" | "Ordered";
    count: number;
    score: string;
    paymentDate: string | null;
    shippingDate: string | null;
    collectionDate: string | null;
    price: string;
    shop: string;
    shippingMethod:
      | "n/a"
      | "EMS"
      | "SAL"
      | "AIRMAIL"
      | "SURFACE"
      | "FEDEX"
      | "DHL"
      | "Colissimo"
      | "UPS"
      | "Domestic";
    notes: string;
    releaseId?: string | null;
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
    shippingMethod:
      | "n/a"
      | "EMS"
      | "SAL"
      | "AIRMAIL"
      | "SURFACE"
      | "FEDEX"
      | "DHL"
      | "Colissimo"
      | "UPS"
      | "Domestic";
    releaseMonthYear: string | null;
  }> = [];

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
        releaseId: null,
        date: null,
      });
    }

    itemReleases.push(...releasesForItem);
  }

  collectionItems = successfulCollectionItems.map((ci) => ({
    userId: userId,
    itemId: ci.id,
    status: ci.status as "Owned" | "Ordered",
    count: ci.count,
    score: ci.score && ci.score.trim() !== "" ? ci.score.toString() : "0.0",
    paymentDate: ci.payment_date,
    shippingDate: ci.shipping_date,
    collectionDate: ci.collecting_date,
    price: ci.price && ci.price.trim() !== "" ? ci.price.toString() : "0.00",
    shop: ci.shop,
    shippingMethod: ci.shipping_method as
      | "n/a"
      | "EMS"
      | "SAL"
      | "AIRMAIL"
      | "SURFACE"
      | "FEDEX"
      | "DHL"
      | "Colissimo"
      | "UPS"
      | "Domestic",
    notes: ci.note,
    releaseId: latestReleaseIdByItem.get(ci.id)?.releaseId ?? null,
    orderId: ci.orderId,
    orderDate: ci.orderDate,
  }));

  orders = successfulCollectionItems
    .filter((ci) => ci.orderId !== null)
    .map((ci) => ({
      id: ci.orderId!,
      userId: userId,
      title:
        successfulResults.find((result) => result.id === ci.id)?.title ??
        `Order ${ci.orderId}`,
      shop: ci.shop,
      orderDate: ci.orderDate,
      paymentDate: ci.payment_date,
      shippingDate: ci.shipping_date,
      collectionDate: ci.collecting_date,
      shippingMethod: ci.shipping_method as
        | "n/a"
        | "EMS"
        | "SAL"
        | "AIRMAIL"
        | "SURFACE"
        | "FEDEX"
        | "DHL"
        | "Colissimo"
        | "UPS"
        | "Domestic",
      releaseMonthYear: latestReleaseIdByItem.get(ci.id)?.date ?? null,
    }));

  console.log("Items to be inserted:", items);
  console.log("Releases to be inserted:", itemReleases);
  console.log("Entries to be inserted:", entries);
  console.log("Entry to Items to be inserted:", entryToItems);
  console.log("Collection Items to be inserted:", collectionItems);
  console.log("Orders to be inserted:", orders);

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
      if (orders.length > 0) {
        await tx.insert(order).values(orders);
      }
      await tx.insert(collection).values(collectionItems);
    });

    console.log("Successfully inserted data to database.");
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
    `Sync completed: Synced ${successfulResults.length} out of ${csvItems.length} items`,
    true
  );
  return {
    status: "Sync Job completed",
    processedAt: new Date().toISOString(),
  };
}
