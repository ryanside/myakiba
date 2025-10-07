import { db } from "@/db";
import { item, collection, item_release, order } from "@/db/schema/figure";
import { and, inArray, eq, sql } from "drizzle-orm";
import type {
  collectionInsertType,
  csvItem,
  orderInsertType,
  status,
  UpdatedSyncCollection,
  UpdatedSyncOrder,
  UpdatedSyncOrderItem,
} from "./model";
import { sanitizeDate } from "@/lib/utils";

import { Queue } from "bullmq";
import Redis from "ioredis";
import { createId } from "@paralleldrive/cuid2";

const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT!),
});
const syncQueue = new Queue("sync-queue", {
  connection: {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT!),
  },
});

class SyncService {
  async getExistingItemIdsInCollection(
    itemIds: number[],
    userId: string
  ): Promise<{ itemId: number }[]> {
    if (!itemIds || itemIds.length === 0) {
      return [];
    }

    return await db
      .select({ itemId: collection.itemId })
      .from(collection)
      .where(
        and(inArray(collection.itemId, itemIds), eq(collection.userId, userId))
      );
  }

  async getExistingItemsWithReleases(itemIds: number[]): Promise<{
    items: { id: number; title: string }[];
    releases: Map<number, string>;
    releaseDates: Map<number, string>;
  }> {
    if (!itemIds || itemIds.length === 0) {
      return { items: [], releases: new Map(), releaseDates: new Map() };
    }

    const items = await db
      .select({ id: item.id, title: item.title })
      .from(item)
      .where(inArray(item.id, itemIds));

    const releases = new Map<number, string>();
    const releaseDates = new Map<number, string>();
    const releaseResult = await db.execute<{
      itemId: number;
      releaseId: string;
      releaseDate: string;
    }>(sql`
        SELECT DISTINCT ON (${item_release.itemId})
          ${item_release.itemId} AS "itemId",
          ${item_release.id} AS "releaseId",
          ${item_release.date} AS "releaseDate"
        FROM ${item_release}
        WHERE ${inArray(item_release.itemId, itemIds)}
        ORDER BY ${item_release.itemId}, ${item_release.date} DESC, ${item_release.createdAt} DESC
      `);

    for (const row of releaseResult) {
      releases.set(row.itemId, row.releaseId);
      releaseDates.set(row.itemId, row.releaseDate);
    }

    return { items, releases, releaseDates };
  }

  async insertToCollectionAndOrders(
    collectionItems: collectionInsertType[],
    orderItems?: orderInsertType[]
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

  assignOrderIdsAndSanitizeDates(items: csvItem[]): csvItem[] {
    return items.map((item) => ({
      ...item,
      orderId: item.status === "Ordered" ? createId() : item.orderId,
      payment_date: sanitizeDate(item.payment_date),
      shipping_date: sanitizeDate(item.shipping_date),
      collecting_date: sanitizeDate(item.collecting_date),
      orderDate: sanitizeDate(item.orderDate),
    }));
  }

  async processItems(items: csvItem[], userId: string) {
    const itemIds: number[] = items.map((item: csvItem) => item.id);

    const idsInCollection = await this.getExistingItemIdsInCollection(
      itemIds,
      userId
    );

    const idsRequiringItemLookup = itemIds.filter(
      (itemId) =>
        !idsInCollection.some(
          (collectionItem) => collectionItem.itemId === itemId
        )
    );

    const {
      items: existingItems,
      releases: existingItemsReleases, // release ids
      releaseDates: existingItemsReleaseDates, // release dates
    } = await this.getExistingItemsWithReleases(idsRequiringItemLookup);

    const csvItemsToInsert = items.filter((item: csvItem) =>
      existingItems.some((existingItem) => existingItem.id === item.id)
    );

    const idsToScrape = idsRequiringItemLookup.filter(
      (id) => !existingItems.some((existingItem) => existingItem.id === id)
    );
    const csvItemsToScrape = items.filter((item: csvItem) =>
      idsToScrape.includes(item.id)
    );

    const orderItems: orderInsertType[] = [];
    csvItemsToInsert.forEach((item) => {
      if (item.status === "Ordered") {
        const itemTitle = existingItems.find(
          (existingItem) => existingItem.id === item.id
        )?.title;

        orderItems.push({
          id: item.orderId!,
          userId: userId,
          title: itemTitle ? itemTitle : `Order ${item.orderId}`,
          shop: item.shop,
          orderDate: item.orderDate,
          releaseMonthYear: existingItemsReleaseDates.get(item.id),
          paymentDate: item.payment_date,
          shippingDate: item.shipping_date,
          collectionDate: item.collecting_date,
          shippingMethod: item.shipping_method,
        });
      }
    });

    const collectionItems = csvItemsToInsert.map((i) => ({
      userId: userId,
      itemId: i.id,
      status: i.status,
      count: i.count,
      score: i.score && i.score.trim() !== "" ? i.score : "0.0",
      paymentDate: i.payment_date,
      shippingDate: i.shipping_date,
      collectionDate: sanitizeDate(i.collecting_date),
      price: i.price && i.price.trim() !== "" ? i.price : "0.00",
      shop: i.shop,
      shippingMethod: i.shipping_method,
      notes: i.note,
      releaseId: existingItemsReleases.get(i.id) ?? null,
      orderId: i.orderId,
      orderDate: i.orderDate,
    }));

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
      }
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
      60
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
    itemsToInsert: UpdatedSyncOrderItem[]
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
      }
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
      60
    );

    if (!setJobStatus) {
      throw new Error("FAILED_TO_SET_JOB_STATUS_IN_REDIS");
    }

    return job.id;
  }

  async queueCollectionSyncJob(
    userId: string,
    itemsToScrape: UpdatedSyncCollection[],
    itemsToInsert: UpdatedSyncCollection[]
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
      }
    );

    if (!job) {
      throw new Error("FAILED_TO_QUEUE_COLLECTION_SYNC_JOB");
    }

    const setJobStatus = await redis.set(
      `job:${job.id}:status`,
      JSON.stringify({
        status:
          "Your collection sync job has been added to queue. Please wait...",
        finished: false,
        createdAt: new Date().toISOString(),
      }),
      "EX",
      60
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
