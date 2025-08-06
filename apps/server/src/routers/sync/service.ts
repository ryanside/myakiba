import { db } from "@/db";
import { item, collection } from "@/db/schema/figure";
import { and, inArray, eq } from "drizzle-orm";
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
    return await db.insert(collection).values(
      items.map((item) => ({
        userId: userId,
        itemId: item.id,
        status: item.status,
        count: item.count,
        score: item.score,
        paymentDate: sanitizeDate(item.payment_date),
        shippingDate: sanitizeDate(item.shipping_date),
        collectionDate: sanitizeDate(item.collecting_date),
        price: item.price.toString(),
        shop: item.shop,
        shippingMethod: item.shipping_method,
        notes: item.note,
      }))
    );
  } catch (error) {
    console.error("Failed to insert items to collection table");
    throw error;
  }
}
