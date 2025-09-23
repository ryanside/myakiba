import { db } from "@/db";
import {
  collection,
  entry,
  entry_to_item,
  item,
  item_release,
} from "@/db/schema/figure";
import {
  and,
  eq,
  between,
  inArray,
  arrayContains,
  desc,
  asc,
  ilike,
} from "drizzle-orm";
import type { collectionUpdateType } from "./model";

class ManagerService {
  async getCollectionTable(
    userId: string,
    limit: number,
    offset: number,
    sortBy: string,
    orderBy: string,
    paid?: Array<string>,
    shop?: Array<string>,
    paymentDate?: Array<string>,
    shippingDate?: Array<string>,
    collectionDate?: Array<string>,
    shippingMethod?: Array<"n/a" | "EMS" | "SAL" | "AIRMAIL" | "SURFACE" | "FEDEX" | "DHL" | "Colissimo" | "UPS" | "Domestic">,
    releaseDate?: Array<string>,
    releasePrice?: Array<string>,
    releaseCurrency?: Array<string>,
    category?: Array<string>,
    entries?: Array<string>,
    scale?: Array<string>,
    tags?: Array<string>,
    condition?: Array<"New" | "Pre-Owned">,
    search?: string
  ) {
    const filters = and(
      eq(collection.userId, userId),
      shop ? inArray(collection.shop, shop) : undefined,
      paid ? between(collection.price, paid[0], paid[1]) : undefined,
      paymentDate
        ? between(collection.paymentDate, paymentDate[0], paymentDate[1])
        : undefined,
      shippingDate
        ? between(collection.shippingDate, shippingDate[0], shippingDate[1])
        : undefined,
      collectionDate
        ? between(
            collection.collectionDate,
            collectionDate[0],
            collectionDate[1]
          )
        : undefined,
      shippingMethod
        ? inArray(collection.shippingMethod, shippingMethod)
        : undefined,
      category ? inArray(item.category, category) : undefined,
      scale ? inArray(item.scale, scale) : undefined,
      tags ? arrayContains(collection.tags, tags) : undefined,
      condition ? inArray(collection.condition, condition) : undefined,
      releaseDate && releaseDate.length > 0
        ? between(item_release.date, releaseDate[0], releaseDate[1])
        : undefined,
      releasePrice && releasePrice.length > 0
        ? between(item_release.price, releasePrice[0], releasePrice[1])
        : undefined,
      releaseCurrency && releaseCurrency.length > 0
        ? inArray(item_release.priceCurrency, releaseCurrency)
        : undefined,
      search ? ilike(item.title, `%${search}%`) : undefined
    );

    const sortByColumn = (() => {
      switch (sortBy) {
        case "release":
          return item_release.date;
        case "paid":
          return collection.paymentDate;
        case "price":
          return collection.price;
        case "score":
          return collection.score;
        case "payDate":
          return collection.paymentDate;
        case "shipDate":
          return collection.shippingDate;
        case "colDate":
          return collection.collectionDate;
        case "height":
          return item.height;
        case "scale":
          return item.scale;
        case "shop":
          return collection.shop;
        case "createdAt":
          return collection.createdAt;
        default:
          return collection.createdAt;
      }
    })();

    const collectionItems = await db
      .select({
        collectionId: collection.id,
        itemId: item.id,
        itemTitle: item.title,
        itemImage: item.image,
        itemCategory: item.category,
        itemScale: item.scale,
        itemHeight: item.height,
        status: collection.status,
        count: collection.count,
        score: collection.score,
        price: collection.price,
        shop: collection.shop,
        paymentDate: collection.paymentDate,
        shippingDate: collection.shippingDate,
        collectionDate: collection.collectionDate,
        shippingMethod: collection.shippingMethod,
        notes: collection.notes,
        releaseId: collection.releaseId,
        releaseDate: item_release.date,
        releasePrice: item_release.price,
        releaseCurrency: item_release.priceCurrency,
        createdAt: collection.createdAt,
        updatedAt: collection.updatedAt,
      })
      .from(collection)
      .innerJoin(item, eq(collection.itemId, item.id))
      .leftJoin(item_release, eq(collection.releaseId, item_release.id))
      .where(filters)
      .orderBy(orderBy === "asc" ? asc(sortByColumn) : desc(sortByColumn))
      .limit(limit)
      .offset(offset);

    let filteredItems = collectionItems;
    if (entries && entries.length > 0) {
      const itemsWithEntries = await db
        .select({
          itemId: entry_to_item.itemId,
        })
        .from(entry_to_item)
        .innerJoin(entry, eq(entry_to_item.entryId, entry.id))
        .where(inArray(entry.name, entries));

      const entryItemIds = itemsWithEntries.map((item) => item.itemId);
      filteredItems = collectionItems.filter((item) =>
        entryItemIds.includes(item.itemId)
      );
    }

    return filteredItems;
  }

  async getCollectionItem(userId: string, collectionId: string) {
    const collectionItem = await db
      .select({
        collectionId: collection.id,
        itemId: item.id,
        itemTitle: item.title,
        itemImage: item.image,
        itemCategory: item.category,
        itemScale: item.scale,
        itemHeight: item.height,
        status: collection.status,
        count: collection.count,
        score: collection.score,
        price: collection.price,
        shop: collection.shop,
        paymentDate: collection.paymentDate,
        shippingDate: collection.shippingDate,
        collectionDate: collection.collectionDate,
        shippingMethod: collection.shippingMethod,
        notes: collection.notes,
        releaseId: collection.releaseId,
        releaseDate: item_release.date,
        releasePrice: item_release.price,
        releaseCurrency: item_release.priceCurrency,
        createdAt: collection.createdAt,
        updatedAt: collection.updatedAt,
      })
      .from(collection)
      .innerJoin(item, eq(collection.itemId, item.id))
      .leftJoin(item_release, eq(collection.releaseId, item_release.id))
      .where(
        and(eq(collection.userId, userId), eq(collection.id, collectionId))
      );

    if (!collectionItem || collectionItem.length === 0) {
      throw new Error("COLLECTION_ITEM_NOT_FOUND");
    }

    return collectionItem[0];
  }

  async updateCollectionItem(
    userId: string,
    collectionId: string,
    updateData: collectionUpdateType
  ) {
    const updated = await db
      .update(collection)
      .set({
        ...updateData,
        updatedAt: new Date(),
      })
      .where(
        and(eq(collection.userId, userId), eq(collection.id, collectionId))
      );

    if (!updated || updated.length === 0) {
      throw new Error("COLLECTION_ITEM_NOT_FOUND");
    }

    return updated[0];
  }

  async deleteCollectionItem(userId: string, collectionId: string) {
    const deleted = await db
      .delete(collection)
      .where(
        and(eq(collection.userId, userId), eq(collection.id, collectionId))
      );

    if (!deleted || deleted.length === 0) {
      throw new Error("COLLECTION_ITEM_NOT_FOUND");
    }

    return deleted[0];
  }

  async deleteCollectionItems(userId: string, collectionIds: string[]) {
    const deleted = await db
      .delete(collection)
      .where(
        and(
          eq(collection.userId, userId),
          inArray(collection.id, collectionIds)
        )
      );

    if (!deleted || deleted.length === 0) {
      throw new Error("COLLECTION_ITEMS_NOT_FOUND");
    }

    return deleted[0];
  }
}

export default new ManagerService();
