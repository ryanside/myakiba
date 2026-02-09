import { db } from "@myakiba/db";
import {
  item,
  collection,
  item_release,
  order,
  syncSession,
  syncSessionItem,
} from "@myakiba/db/schema/figure";
import { and, inArray, eq, desc, count, sql } from "drizzle-orm";
import type {
  csvItem,
  status,
  UpdatedSyncCollection,
  UpdatedSyncOrder,
  UpdatedSyncOrderItem,
  CollectionInsertType,
} from "./model";
import type { OrderInsertType } from "../orders/model";
import type {
  SyncSessionRow,
  EnrichedSyncSessionItemRow,
  SyncSessionStatus,
  SyncType,
} from "@myakiba/types";
import { Queue } from "bullmq";
import { createId } from "@paralleldrive/cuid2";
import { env } from "@myakiba/env/server";
import { dateToString, parseMoneyToMinorUnits } from "@myakiba/utils";
import { redis } from "@myakiba/redis";
import {
  csvItemMetadataSchema,
  orderItemMetadataSchema,
  collectionItemMetadataSchema,
  syncOrderSchema,
} from "@myakiba/schemas";

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
    collectionItems: CollectionInsertType[],
    orderItems?: OrderInsertType[],
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

    const orderItems: OrderInsertType[] = [];
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
            releaseDate: existingItemsReleaseDates.get(itemId) ?? null,
            paymentDate: item.payment_date,
            shippingDate: item.shipping_date,
            collectionDate: item.collecting_date,
            shippingMethod: item.shipping_method,
          });
        }
      }
    });

    const collectionItems = csvItemsToInsert
      .map((i): CollectionInsertType | null => {
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
          price: i.price && i.price.trim() !== "" ? parseMoneyToMinorUnits(i.price) : 0,
          shop: i.shop,
          shippingMethod: i.shipping_method,
          notes: i.note,
          releaseId: existingItemsReleases.get(internalItemId) ?? null,
          orderId: i.orderId,
          orderDate: i.orderDate,
        };
      })
      .filter((item): item is CollectionInsertType => item !== null);

    return {
      collectionItems,
      orderItems,
      csvItemsToScrape,
      existingItemExternalIds: csvItemsToInsert.map((i) => i.itemExternalId),
    };
  }

  async queueCSVSyncJob(items: csvItem[], userId: string, syncSessionId: string) {
    const job = await syncQueue.add(
      "sync-job",
      {
        type: "csv" as const,
        userId: userId,
        syncSessionId,
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

    if (job.id) {
      await this.updateSyncSession(syncSessionId, { jobId: job.id });
    }

    return job.id;
  }

  async queueOrderSyncJob(
    userId: string,
    order: UpdatedSyncOrder,
    itemsToScrape: UpdatedSyncOrderItem[],
    itemsToInsert: UpdatedSyncOrderItem[],
    syncSessionId: string,
  ) {
    const job = await syncQueue.add(
      "sync-job",
      {
        type: "order" as const,
        userId: userId,
        syncSessionId,
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

    if (job.id) {
      await this.updateSyncSession(syncSessionId, { jobId: job.id });
    }

    return job.id;
  }

  async queueCollectionSyncJob(
    userId: string,
    itemsToScrape: UpdatedSyncCollection[],
    itemsToInsert: UpdatedSyncCollection[],
    syncSessionId: string,
  ) {
    const job = await syncQueue.add(
      "sync-job",
      {
        type: "collection" as const,
        userId: userId,
        syncSessionId,
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

    if (job.id) {
      await this.updateSyncSession(syncSessionId, { jobId: job.id });
    }

    return job.id;
  }

  async getJobStatus(jobId: string): Promise<status> {
    const cached = await redis.get(`job:${jobId}:status`);
    if (cached) {
      return JSON.parse(cached) as status;
    }

    // Redis key expired — fall back to the persistent sync session record
    const [session] = await db
      .select({
        status: syncSession.status,
        statusMessage: syncSession.statusMessage,
        createdAt: syncSession.createdAt,
      })
      .from(syncSession)
      .where(eq(syncSession.jobId, jobId));

    if (!session) {
      throw new Error("SYNC_JOB_NOT_FOUND");
    }

    const FINISHED_STATUSES = ["completed", "failed", "partial"] as const;
    const finished = FINISHED_STATUSES.includes(
      session.status as (typeof FINISHED_STATUSES)[number],
    );

    const statusMessage =
      session.statusMessage !== "" ? session.statusMessage : `Sync ${session.status}`;

    return {
      status: statusMessage,
      finished,
      createdAt: session.createdAt.toISOString(),
    };
  }

  // ── Sync Session Methods ──────────────────────────────────────────────

  async createSyncSession(
    userId: string,
    syncType: "csv" | "order" | "collection",
    itemExternalIds: readonly number[],
    options?: {
      readonly orderId?: string;
      readonly orderPayload?: UpdatedSyncOrder;
      readonly itemMetadata?: ReadonlyMap<number, Record<string, unknown>>;
      readonly existingItemExternalIds?: readonly number[];
    },
  ): Promise<string> {
    const sessionId = createId();
    const existingIds = options?.existingItemExternalIds ?? [];

    await db.transaction(async (tx) => {
      await tx.insert(syncSession).values({
        id: sessionId,
        userId,
        syncType,
        orderId: options?.orderId ?? null,
        orderPayload: options?.orderPayload ?? null,
        totalItems: itemExternalIds.length + existingIds.length,
        successCount: existingIds.length,
      });

      const pendingRows = itemExternalIds.map((externalId) => ({
        syncSessionId: sessionId,
        itemExternalId: externalId,
        metadata: options?.itemMetadata?.get(externalId) ?? null,
      }));

      const scrapedRows = existingIds.map((externalId) => ({
        syncSessionId: sessionId,
        itemExternalId: externalId,
        status: "scraped" as const,
        metadata: options?.itemMetadata?.get(externalId) ?? null,
      }));

      const allRows = [...pendingRows, ...scrapedRows];
      if (allRows.length > 0) {
        await tx.insert(syncSessionItem).values(allRows);
      }
    });

    return sessionId;
  }

  async getSyncSessions(
    userId: string,
    page: number,
    limit: number,
    statusFilter?: SyncSessionStatus,
    syncTypeFilter?: SyncType,
  ): Promise<{ sessions: SyncSessionRow[]; total: number }> {
    const offset = (page - 1) * limit;

    const conditions = [eq(syncSession.userId, userId)];
    if (statusFilter) conditions.push(eq(syncSession.status, statusFilter));
    if (syncTypeFilter) conditions.push(eq(syncSession.syncType, syncTypeFilter));
    const whereClause = and(...conditions);

    const [sessions, [{ total }]] = await Promise.all([
      db
        .select()
        .from(syncSession)
        .where(whereClause)
        .orderBy(
          sql`CASE WHEN ${syncSession.status} IN ('pending', 'processing') THEN 0 ELSE 1 END`,
          desc(syncSession.createdAt),
        )
        .limit(limit)
        .offset(offset),
      db.select({ total: count() }).from(syncSession).where(whereClause),
    ]);

    return { sessions, total };
  }

  async getSyncSessionDetail(
    sessionId: string,
    userId: string,
    page?: number,
    limit?: number,
  ): Promise<{
    session: SyncSessionRow;
    items: EnrichedSyncSessionItemRow[];
    totalItems: number;
  } | null> {
    const [session] = await db
      .select()
      .from(syncSession)
      .where(and(eq(syncSession.id, sessionId), eq(syncSession.userId, userId)));

    if (!session) return null;

    const baseQuery = db
      .select({
        id: syncSessionItem.id,
        syncSessionId: syncSessionItem.syncSessionId,
        itemExternalId: syncSessionItem.itemExternalId,
        metadata: syncSessionItem.metadata,
        status: syncSessionItem.status,
        errorReason: syncSessionItem.errorReason,
        retryCount: syncSessionItem.retryCount,
        createdAt: syncSessionItem.createdAt,
        updatedAt: syncSessionItem.updatedAt,
        itemId: item.id,
        itemTitle: item.title,
        itemImage: item.image,
      })
      .from(syncSessionItem)
      .leftJoin(
        item,
        and(eq(item.externalId, syncSessionItem.itemExternalId), eq(item.source, "mfc")),
      )
      .where(eq(syncSessionItem.syncSessionId, sessionId))
      .orderBy(syncSessionItem.createdAt);

    const countQuery = db
      .select({ total: count() })
      .from(syncSessionItem)
      .where(eq(syncSessionItem.syncSessionId, sessionId));

    const usePagination = page !== undefined && limit !== undefined;
    const offset = usePagination ? (page - 1) * limit : 0;

    const [rows, [{ total }]] = await Promise.all([
      usePagination ? baseQuery.limit(limit).offset(offset) : baseQuery,
      countQuery,
    ]);

    const items: EnrichedSyncSessionItemRow[] = rows.map((row) => ({
      ...row,
      itemId: row.itemId ?? null,
      itemTitle: row.itemTitle ?? null,
      itemImage: row.itemImage ?? null,
    }));

    return { session, items, totalItems: total };
  }

  async updateSyncSession(
    sessionId: string,
    updates: {
      readonly status?: "pending" | "processing" | "completed" | "failed" | "partial";
      readonly statusMessage?: string;
      readonly jobId?: string;
      readonly orderId?: string;
      readonly successCount?: number;
      readonly failCount?: number;
      readonly completedAt?: Date | null;
    },
  ): Promise<void> {
    await db
      .update(syncSession)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(syncSession.id, sessionId));
  }

  async updateSyncSessionItem(
    syncSessionId: string,
    itemExternalId: number,
    itemStatus: "pending" | "scraped" | "failed",
    errorReason?: string,
  ): Promise<void> {
    await db
      .update(syncSessionItem)
      .set({
        status: itemStatus,
        errorReason: errorReason ?? null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(syncSessionItem.syncSessionId, syncSessionId),
          eq(syncSessionItem.itemExternalId, itemExternalId),
        ),
      );
  }

  async retryFailedItems(
    sessionId: string,
    userId: string,
  ): Promise<{ jobId: string; itemCount: number }> {
    const sessionDetail = await this.getSyncSessionDetail(sessionId, userId);
    if (!sessionDetail) throw new Error("SYNC_SESSION_NOT_FOUND");

    const { session: sessionData, items: allItems } = sessionDetail;

    // Atomically claim only items that are still "failed" to prevent duplicate retries.
    // If two requests race, the first UPDATE claims the rows; the second finds none.
    const claimedItemIds = await db.transaction(async (tx) => {
      const claimed = await tx
        .update(syncSessionItem)
        .set({
          status: "pending",
          errorReason: null,
          retryCount: sql`${syncSessionItem.retryCount} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(eq(syncSessionItem.syncSessionId, sessionId), eq(syncSessionItem.status, "failed")),
        )
        .returning({ id: syncSessionItem.id });

      if (claimed.length === 0) throw new Error("NO_FAILED_ITEMS_TO_RETRY");

      await tx
        .update(syncSession)
        .set({
          status: "processing",
          completedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(syncSession.id, sessionId));

      return new Set(claimed.map((c) => c.id));
    });

    // Use the claimed IDs to filter the enriched items for building job data
    const itemsToRetry = allItems.filter((i) => claimedItemIds.has(i.id));
    const retryExternalIds = itemsToRetry.map((i) => i.itemExternalId);

    const jobData = await this.buildRetryJobData(
      sessionData.syncType as "csv" | "order" | "collection",
      userId,
      sessionId,
      itemsToRetry,
      sessionData.orderId,
      sessionData.orderPayload,
    );

    const job = await syncQueue.add("sync-job", jobData, {
      removeOnComplete: true,
      removeOnFail: true,
      jobId: createId(),
    });

    if (!job?.id) throw new Error("FAILED_TO_QUEUE_RETRY_JOB");

    const setStatus = await redis.set(
      `job:${job.id}:status`,
      JSON.stringify({
        status: `Retrying ${retryExternalIds.length} failed items...`,
        finished: false,
        createdAt: new Date().toISOString(),
      }),
      "EX",
      60,
    );

    if (!setStatus) throw new Error("FAILED_TO_SET_JOB_STATUS_IN_REDIS");

    await this.updateSyncSession(sessionId, { jobId: job.id });

    return { jobId: job.id, itemCount: retryExternalIds.length };
  }

  private async buildRetryJobData(
    syncType: "csv" | "order" | "collection",
    userId: string,
    syncSessionId: string,
    itemsToRetry: readonly EnrichedSyncSessionItemRow[],
    orderId: string | null,
    storedOrderPayload: unknown,
  ) {
    switch (syncType) {
      case "csv":
        return {
          type: "csv" as const,
          userId,
          syncSessionId,
          items: itemsToRetry.map((item) => {
            const parsed = csvItemMetadataSchema.safeParse(item.metadata);
            if (parsed.success) {
              return { itemExternalId: item.itemExternalId, ...parsed.data };
            }
            return {
              itemExternalId: item.itemExternalId,
              status: "Owned",
              count: 1,
              score: "0.0",
              payment_date: null,
              shipping_date: null,
              collecting_date: null,
              price: "0",
              shop: "",
              shipping_method: "n/a" as const,
              note: "",
              orderId: null,
              orderDate: null,
            };
          }),
        };

      case "order": {
        // orderId may be null if the initial sync failed before the order was created.
        // Fall back to extracting it from the stored order payload.
        let resolvedOrderId = orderId;
        if (!resolvedOrderId && storedOrderPayload) {
          const payloadParsed = syncOrderSchema.safeParse(storedOrderPayload);
          if (payloadParsed.success) resolvedOrderId = payloadParsed.data.id;
        }
        if (!resolvedOrderId) throw new Error("ORDER_NOT_FOUND_FOR_RETRY");

        // Try the order table first (exists when at least one item succeeded).
        // Fall back to the stored payload (covers total scrape failure).
        const [existingOrder] = await db.select().from(order).where(eq(order.id, resolvedOrderId));

        let orderDetails: UpdatedSyncOrder;
        if (existingOrder) {
          orderDetails = {
            id: existingOrder.id,
            userId: existingOrder.userId,
            status: existingOrder.status,
            title: existingOrder.title,
            shop: existingOrder.shop,
            orderDate: existingOrder.orderDate,
            releaseDate: existingOrder.releaseDate,
            paymentDate: existingOrder.paymentDate,
            shippingDate: existingOrder.shippingDate,
            collectionDate: existingOrder.collectionDate,
            shippingMethod: existingOrder.shippingMethod,
            shippingFee: existingOrder.shippingFee,
            taxes: existingOrder.taxes,
            duties: existingOrder.duties,
            tariffs: existingOrder.tariffs,
            miscFees: existingOrder.miscFees,
            notes: existingOrder.notes,
          };
        } else {
          const parsedPayload = syncOrderSchema.safeParse(storedOrderPayload);
          if (!parsedPayload.success) throw new Error("ORDER_NOT_FOUND_FOR_RETRY");
          orderDetails = parsedPayload.data;
        }

        return {
          type: "order" as const,
          userId,
          syncSessionId,
          order: {
            details: orderDetails,
            itemsToScrape: itemsToRetry.map((item) => {
              const parsed = orderItemMetadataSchema.safeParse(item.metadata);
              if (parsed.success) {
                return {
                  userId,
                  orderId: resolvedOrderId,
                  releaseId: null,
                  itemId: null,
                  itemExternalId: item.itemExternalId,
                  ...parsed.data,
                };
              }
              return {
                userId,
                orderId: resolvedOrderId,
                releaseId: null,
                itemId: null,
                itemExternalId: item.itemExternalId,
                price: 0,
                count: 1,
                status: "Ordered" as const,
                condition: "New" as const,
                shippingMethod: "n/a" as const,
                orderDate: orderDetails.orderDate,
                paymentDate: orderDetails.paymentDate,
                shippingDate: orderDetails.shippingDate,
                collectionDate: orderDetails.collectionDate,
              };
            }),
            itemsToInsert: [],
          },
        };
      }

      case "collection":
        return {
          type: "collection" as const,
          userId,
          syncSessionId,
          collection: {
            itemsToScrape: itemsToRetry.map((item) => {
              const parsed = collectionItemMetadataSchema.safeParse(item.metadata);
              if (parsed.success) {
                return {
                  userId,
                  releaseId: null,
                  itemId: null,
                  itemExternalId: item.itemExternalId,
                  ...parsed.data,
                };
              }
              return {
                userId,
                releaseId: null,
                itemId: null,
                itemExternalId: item.itemExternalId,
                price: 0,
                count: 1,
                score: "0.0",
                shop: "",
                orderDate: null,
                paymentDate: null,
                shippingDate: null,
                collectionDate: null,
                shippingMethod: "n/a" as const,
                tags: [] as string[],
                condition: "New" as const,
                notes: "",
              };
            }),
            itemsToInsert: [],
          },
        };
    }
  }
}

export default new SyncService();
