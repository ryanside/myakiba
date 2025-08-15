import { db } from "@/db";
import { item, collection, item_release } from "@/db/schema/figure";
import { and, inArray, eq, sql } from "drizzle-orm";
import type { csvItem } from "./model";
import type { NeonHttpQueryResult } from "drizzle-orm/neon-http";
import { sanitizeDate } from "@/lib/utils";

export async function getExistingItemIdsInCollection(
  itemIds: number[],
  userId: string
): Promise<{ itemId: number }[]> {
  if (!itemIds || itemIds.length === 0) {
    return [];
  }
  try {
    return await db
      .select({ itemId: collection.itemId })
      .from(collection)
      .where(
        and(inArray(collection.itemId, itemIds), eq(collection.userId, userId))
      );
  } catch (error) {
    console.error("Failed to get existing item ids in collection table");
    throw error;
  }
}

export async function getExistingItemIdsInItem(
  itemIds: number[]
): Promise<{ id: number }[]> {
  if (!itemIds || itemIds.length === 0) {
    return [];
  }
  try {
    return await db
      .select({ id: item.id })
      .from(item)
      .where(inArray(item.id, itemIds));
  } catch (error) {
    console.error("Failed to get existing item ids in item table");
    throw error;
  }
}

export async function insertToCollection(
  items: csvItem[],
  userId: string
): Promise<NeonHttpQueryResult<never>> {
  try {
    // TODO: separate this into two functions
    const itemIds = items.map((i) => i.id);

    let latestReleasesByItem = new Map<number, string>();
    if (itemIds.length > 0) {
      const result = await db.execute<{
        itemId: number;
        releaseId: string;
      }>(sql`
        SELECT DISTINCT ON (${item_release.itemId})
          ${item_release.itemId} AS "itemId",
          ${item_release.id} AS "releaseId"
        FROM ${item_release}
        WHERE ${inArray(item_release.itemId, itemIds)}
        ORDER BY ${item_release.itemId}, ${item_release.date} DESC, ${item_release.createdAt} DESC
      `);
      const rows = result.rows as { itemId: number; releaseId: string }[];
      for (const row of rows) {
        latestReleasesByItem.set(row.itemId, row.releaseId);
      }
    }

    return await db.insert(collection).values(
      items.map((i) => ({
        userId: userId,
        itemId: i.id,
        status: i.status,
        count: i.count,
        score: i.score,
        paymentDate: sanitizeDate(i.payment_date),
        shippingDate: sanitizeDate(i.shipping_date),
        collectionDate: sanitizeDate(i.collecting_date),
        price: i.price.toString(),
        shop: i.shop,
        shippingMethod: i.shipping_method,
        notes: i.note,
        releaseId: latestReleasesByItem.get(i.id) ?? null,
      }))
    );
  } catch (error) {
    console.error("Failed to insert items to collection table");
    throw error;
  }
}
