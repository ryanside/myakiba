import { db } from "@/db";
import {
  collection,
  entry,
  entry_to_item,
  item,
  item_release,
  order,
} from "@/db/schema/figure";
import { and, desc, eq, sql } from "drizzle-orm";
import type {
  ItemReleasesResponse,
  ItemRelease,
  EntriesWithRoles,
} from "./model";

class ItemService {
  async getItemReleases(itemId: number): Promise<ItemReleasesResponse> {
    const releases = await db
      .select({
        id: item_release.id,
        itemId: item_release.itemId,
        date: item_release.date,
        type: item_release.type,
        price: item_release.price,
        priceCurrency: item_release.priceCurrency,
        barcode: item_release.barcode,
      })
      .from(item_release)
      .where(eq(item_release.itemId, itemId))
      .orderBy(item_release.date);

    if (!releases) {
      throw new Error("FAILED_TO_GET_ITEM_RELEASES");
    }

    return {
      releases,
    };
  }

  async getItem(itemId: number) {
    const itemData = await db
      .select({
        id: item.id,
        title: item.title,
        category: item.category,
        version: item.version,
        scale: item.scale,
        height: item.height,
        width: item.width,
        depth: item.depth,
        image: item.image,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        releases: sql<ItemRelease[]>`
          COALESCE(
            (
              SELECT JSON_AGG(
                JSON_BUILD_OBJECT(
                  'id', ir.id,
                  'itemId', ir.item_id,
                  'date', ir.date,
                  'type', ir.type,
                  'price', ir.price::text,
                  'priceCurrency', ir.price_currency,
                  'barcode', ir.barcode
                )
                ORDER BY ir.date DESC
              )
              FROM ${item_release} ir
              WHERE ir.item_id = ${item}.id
            ),
            '[]'::json
          )
        `,
        entries: sql<EntriesWithRoles[]>`
          COALESCE(
            (
              SELECT JSON_AGG(
                JSON_BUILD_OBJECT(
                  'id', e.id,
                  'category', e.category,
                  'name', e.name,
                  'role', eti.role
                )
              )
              FROM ${entry_to_item} eti
              LEFT JOIN ${entry} e ON eti.entry_id = e.id
              WHERE eti.item_id = ${item}.id
            ),
            '[]'::json
          )
        `,
      })
      .from(item)
      .where(eq(item.id, itemId));

    if (!itemData || itemData.length === 0) {
      throw new Error("ITEM_NOT_FOUND");
    }

    return itemData[0];
  }
  async getItemRelatedOrders(userId: string, itemId: number) {
    const orders = await db
      .select({
        id: order.id,
        title: order.title,
        shop: order.shop,
        releaseMonthYear: order.releaseMonthYear,
        shippingFee: order.shippingFee,
        taxes: order.taxes,
        duties: order.duties,
        tariffs: order.tariffs,
        miscFees: order.miscFees,
      })
      .from(order)
      .leftJoin(collection, eq(order.id, collection.orderId))
      .where(and(eq(collection.itemId, itemId), eq(order.userId, userId)))
      .groupBy(order.id)
      .orderBy(desc(order.releaseMonthYear));

    if (!orders) {
      throw new Error("FAILED_TO_GET_ITEM_RELATED_ORDERS");
    }

    return orders;
  }
  async getItemRelatedCollection(userId: string, itemId: number) {
    const collectionItems = await db
      .select({
        id: collection.id,
        itemId: collection.itemId,
        orderId: collection.orderId,
        status: collection.status,
        count: collection.count,
        releaseId: collection.releaseId,
        score: collection.score,
        price: collection.price,
        shop: collection.shop,
        orderDate: collection.orderDate,
        paymentDate: collection.paymentDate,
        shippingDate: collection.shippingDate,
        collectionDate: collection.collectionDate,
        shippingMethod: collection.shippingMethod,
        tags: collection.tags,
        condition: collection.condition,
        notes: collection.notes,
        createdAt: collection.createdAt,
        updatedAt: collection.updatedAt,
      })
      .from(collection)
      .where(and(eq(collection.itemId, itemId), eq(collection.userId, userId)))
      .groupBy(collection.id);

    if (!collectionItems) {
      throw new Error("FAILED_TO_GET_ITEM_RELATED_COLLECTION");
    }

    return collectionItems;
  }
}

export default new ItemService();
