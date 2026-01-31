import { db } from "@myakiba/db";
import { item, collection, item_release, order } from "@myakiba/db/schema/figure";
import { and, inArray, eq, desc } from "drizzle-orm";
import type {
  collectionInsertType,
  csvItem,
  orderInsertType,
  status,
  UpdatedSyncCollection,
  UpdatedSyncOrder,
  UpdatedSyncOrderItem,
} from "./model";

import { Queue } from "bullmq";
import Redis from "ioredis";
import { createId } from "@paralleldrive/cuid2";
import { env } from "@myakiba/env/server";
import { dateToString } from "@myakiba/utils";

const redis = new Redis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
});
const syncQueue = new Queue("sync-queue", {
  connection: {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
  },
});

class SyncService {
  async getExistingItemIdsInCollection(
    itemIds: string[],
    userId: string,
  ): Promise<{ itemId: string }[]> {
    if (!itemIds || itemIds.length === 0) {
      return [];
    }

    return await db
      .select({ itemId: collection.itemId })
      .from(collection)
      .where(and(inArray(collection.itemId, itemIds), eq(collection.userId, userId)));
  }

  async getExistingItemsByExternalIds(
    externalIds: number[],
  ): Promise<{ id: string; externalId: number; title: string }[]> {
    if (!externalIds || externalIds.length === 0) {
      return [];
    }

    const existingItems = await db
      .select({ id: item.id, externalId: item.externalId, title: item.title })
      .from(item)
      .where(and(eq(item.source, "mfc"), inArray(item.externalId, externalIds)));

    return existingItems.filter(
      (existingItem): existingItem is { id: string; externalId: number; title: string } =>
        existingItem.externalId !== null,
    );
  }

  async getExistingItemsWithReleases(itemIds: string[]): Promise<{
    items: { id: string; title: string }[];
    releases: Map<string, string>;
    releaseDates: Map<string, string>;
  }> {
    if (!itemIds || itemIds.length === 0) {
      return { items: [], releases: new Map(), releaseDates: new Map() };
    }

    const items = await db
      .select({ id: item.id, title: item.title })
      .from(item)
      .where(inArray(item.id, itemIds));

    const releases = new Map<string, string>();
    const releaseDates = new Map<string, string>();
    const releaseResult = await db
      .selectDistinctOn([item_release.itemId], {
        itemId: item_release.itemId,
        releaseId: item_release.id,
        releaseDate: item_release.date,
      })
      .from(item_release)
      .where(inArray(item_release.itemId, itemIds))
      .orderBy(item_release.itemId, desc(item_release.date), desc(item_release.createdAt));

    for (const row of releaseResult) {
      releases.set(row.itemId, row.releaseId);
      const releaseDate = dateToString(row.releaseDate);
      if (releaseDate) {
        releaseDates.set(row.itemId, releaseDate);
      }
    }

    return { items, releases, releaseDates };
  }

  async insertToCollectionAndOrders(
    collectionItems: collectionInsertType[],
    orderItems?: orderInsertType[],
  ): Promise<void> {
    await db.transaction(async (tx) => {
      if (orderItems && orderItems.length > 0) {
        await tx.insert(order).values(orderItems);
        await tx.insert(collection).values(collectionItems);
      } else {
        await tx.insert(collection).values(collectionItems);
      }
    });
  }

  assignOrderIds(items: csvItem[]): csvItem[] {
    return items.map((item) => ({
      ...item,
      orderId: item.status === "Ordered" ? createId() : item.orderId,
    }));
  }

  async processItems(items: csvItem[], userId: string) {
    const itemExternalIds = items.map((item: csvItem) => item.itemExternalId);

    const existingItems = await this.getExistingItemsByExternalIds(itemExternalIds);
    const existingItemIds = existingItems.map((existingItem) => existingItem.id);

    const idsInCollection = await this.getExistingItemIdsInCollection(existingItemIds, userId);

    const idsInCollectionSet = new Set(
      idsInCollection.map((collectionItem) => collectionItem.itemId),
    );

    const externalIdToInternalId = new Map(
      existingItems.map((existingItem) => [existingItem.externalId, existingItem.id]),
    );

    const itemsNeedingInsert = existingItems.filter(
      (existingItem) => !idsInCollectionSet.has(existingItem.id),
    );

    const itemIdsNeedingInsert = itemsNeedingInsert.map((existingItem) => existingItem.id);

    const { releases: existingItemsReleases, releaseDates: existingItemsReleaseDates } =
      await this.getExistingItemsWithReleases(itemIdsNeedingInsert);

    const csvItemsToInsert = items.filter((item: csvItem) =>
      itemsNeedingInsert.some((existingItem) => existingItem.externalId === item.itemExternalId),
    );

    const idsToScrape = itemExternalIds.filter(
      (externalId) => !existingItems.some((existingItem) => existingItem.externalId === externalId),
    );
    const csvItemsToScrape = items.filter((item: csvItem) =>
      idsToScrape.includes(item.itemExternalId),
    );

    const orderItems: orderInsertType[] = [];
    csvItemsToInsert.forEach((item) => {
      if (item.status === "Ordered") {
        const itemTitle = existingItems.find(
          (existingItem) => existingItem.externalId === item.itemExternalId,
        )?.title;
        const itemId = externalIdToInternalId.get(item.itemExternalId);

        if (itemId) {
          orderItems.push({
            id: item.orderId!,
            userId: userId,
            title: itemTitle ? itemTitle : `Order ${item.orderId}`,
            shop: item.shop,
            orderDate: item.orderDate,
            releaseMonthYear: existingItemsReleaseDates.get(itemId) ?? null,
            paymentDate: item.payment_date,
            shippingDate: item.shipping_date,
            collectionDate: item.collecting_date,
            shippingMethod: item.shipping_method,
          });
        }
      }
    });

    const collectionItems = csvItemsToInsert
      .map((i): collectionInsertType | null => {
        const internalItemId = externalIdToInternalId.get(i.itemExternalId);
        if (!internalItemId) {
          return null;
        }

        return {
          userId: userId,
          itemId: internalItemId,
          status: i.status,
          count: i.count,
          score: i.score && i.score.trim() !== "" ? i.score : "0.0",
          paymentDate: i.payment_date,
          shippingDate: i.shipping_date,
          collectionDate: i.collecting_date,
          price: i.price && i.price.trim() !== "" ? i.price : "0.00",
          shop: i.shop,
          shippingMethod: i.shipping_method,
          notes: i.note,
          releaseId: existingItemsReleases.get(internalItemId) ?? null,
          orderId: i.orderId,
          orderDate: i.orderDate,
        };
      })
      .filter((item): item is collectionInsertType => item !== null);

    return {
      collectionItems,
      orderItems,
      csvItemsToScrape,
    };
  }

  async queueCSVSyncJob(items: csvItem[], userId: string) {
    const job = await syncQueue.add(
      "sync-job",
      {
        type: "csv" as const,
        userId: userId,
        items: items,
      },
      {
        removeOnComplete: true,
        removeOnFail: true,
        jobId: createId(),
      },
    );

    if (!job) {
      throw new Error("FAILED_TO_QUEUE_CSV_SYNC_JOB");
    }

    const setJobStatus = await redis.set(
      `job:${job.id}:status`,
      JSON.stringify({
        status: "Your CSV sync job has been added to queue. Please wait...",
        finished: false,
        createdAt: new Date().toISOString(),
      }),
      "EX",
      60,
    );

    if (!setJobStatus) {
      throw new Error("FAILED_TO_SET_JOB_STATUS_IN_REDIS");
    }

    return job.id;
  }

  async queueOrderSyncJob(
    userId: string,
    order: UpdatedSyncOrder,
    itemsToScrape: UpdatedSyncOrderItem[],
    itemsToInsert: UpdatedSyncOrderItem[],
  ) {
    const job = await syncQueue.add(
      "sync-job",
      {
        type: "order" as const,
        userId: userId,
        order: {
          details: order,
          itemsToScrape: itemsToScrape,
          itemsToInsert: itemsToInsert,
        },
      },
      {
        removeOnComplete: true,
        removeOnFail: true,
        jobId: createId(),
      },
    );

    if (!job) {
      throw new Error("FAILED_TO_QUEUE_ORDER_SYNC_JOB");
    }

    const setJobStatus = await redis.set(
      `job:${job.id}:status`,
      JSON.stringify({
        status: "Your order sync job has been added to queue. Please wait...",
        finished: false,
        createdAt: new Date().toISOString(),
      }),
      "EX",
      60,
    );

    if (!setJobStatus) {
      throw new Error("FAILED_TO_SET_JOB_STATUS_IN_REDIS");
    }

    return job.id;
  }

  async queueCollectionSyncJob(
    userId: string,
    itemsToScrape: UpdatedSyncCollection[],
    itemsToInsert: UpdatedSyncCollection[],
  ) {
    const job = await syncQueue.add(
      "sync-job",
      {
        type: "collection" as const,
        userId: userId,
        collection: {
          itemsToScrape: itemsToScrape,
          itemsToInsert: itemsToInsert,
        },
      },
      {
        removeOnComplete: true,
        removeOnFail: true,
        jobId: createId(),
      },
    );

    if (!job) {
      throw new Error("FAILED_TO_QUEUE_COLLECTION_SYNC_JOB");
    }

    const setJobStatus = await redis.set(
      `job:${job.id}:status`,
      JSON.stringify({
        status: "Your collection sync job has been added to queue. Please wait...",
        finished: false,
        createdAt: new Date().toISOString(),
      }),
      "EX",
      60,
    );

    if (!setJobStatus) {
      throw new Error("FAILED_TO_SET_JOB_STATUS_IN_REDIS");
    }

    return job.id;
  }

  async getJobStatus(jobId: string) {
    const status = await redis.get(`job:${jobId}:status`);
    if (!status) {
      throw new Error("SYNC_JOB_NOT_FOUND");
    }
    return JSON.parse(status) as status;
  }
}

export default new SyncService();
