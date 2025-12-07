import { db } from "@/db";
import {
  collection,
  entry_to_item,
  item,
  item_release,
} from "@/db/schema/figure";
import {
  and,
  eq,
  gte,
  lte,
  inArray,
  arrayContains,
  desc,
  asc,
  ilike,
  sql,
  count,
  sum,
} from "drizzle-orm";
import type { collectionUpdateType } from "./model";

class CollectionService {
  async getCollection(
    userId: string,
    limit: number,
    offset: number,
    sortBy: string,
    orderBy: string,
    paidMin?: string,
    paidMax?: string,
    shop?: Array<string>,
    paymentDateStart?: string,
    paymentDateEnd?: string,
    shippingDateStart?: string,
    shippingDateEnd?: string,
    collectionDateStart?: string,
    collectionDateEnd?: string,
    shippingMethod?: Array<
      | "n/a"
      | "EMS"
      | "SAL"
      | "AIRMAIL"
      | "SURFACE"
      | "FEDEX"
      | "DHL"
      | "Colissimo"
      | "UPS"
      | "Domestic"
    >,
    releaseDateStart?: string,
    releaseDateEnd?: string,
    releasePriceMin?: string,
    releasePriceMax?: string,
    releaseCurrency?: Array<string>,
    category?: Array<string>,
    entries?: Array<number>,
    scale?: Array<string>,
    tags?: Array<string>,
    condition?: Array<"New" | "Pre-Owned">,
    search?: string
  ) {
    let itemIdsWithEntries: number[] | undefined;
    if (entries && entries.length > 0) {
      const itemsWithEntries = await db
        .select({
          itemId: entry_to_item.itemId,
        })
        .from(entry_to_item)
        .where(inArray(entry_to_item.entryId, entries));

      itemIdsWithEntries = itemsWithEntries.map((item) => item.itemId);
      
      // if (itemIdsWithEntries.length === 0) {
      //   return {
      //     collectionItems: [],
      //     collectionStats: {
      //       totalItems: 0,
      //       totalSpent: "0",
      //       totalItemsThisMonth: 0,
      //       totalSpentThisMonth: "0",
      //     },
      //   };
      // }
    }

    const filters = and(
      eq(collection.userId, userId),
      eq(collection.status, "Owned"),
      shop ? inArray(collection.shop, shop) : undefined,
      paidMin ? gte(collection.price, paidMin) : undefined,
      paidMax ? lte(collection.price, paidMax) : undefined,
      paymentDateStart
        ? gte(collection.paymentDate, paymentDateStart)
        : undefined,
      paymentDateEnd ? lte(collection.paymentDate, paymentDateEnd) : undefined,
      shippingDateStart
        ? gte(collection.shippingDate, shippingDateStart)
        : undefined,
      shippingDateEnd
        ? lte(collection.shippingDate, shippingDateEnd)
        : undefined,
      collectionDateStart
        ? gte(collection.collectionDate, collectionDateStart)
        : undefined,
      collectionDateEnd
        ? lte(collection.collectionDate, collectionDateEnd)
        : undefined,
      shippingMethod
        ? inArray(collection.shippingMethod, shippingMethod)
        : undefined,
      category ? inArray(item.category, category) : undefined,
      scale ? inArray(item.scale, scale) : undefined,
      tags ? arrayContains(collection.tags, tags) : undefined,
      condition ? inArray(collection.condition, condition) : undefined,
      releaseDateStart ? gte(item_release.date, releaseDateStart) : undefined,
      releaseDateEnd ? lte(item_release.date, releaseDateEnd) : undefined,
      releasePriceMin ? gte(item_release.price, releasePriceMin) : undefined,
      releasePriceMax ? lte(item_release.price, releasePriceMax) : undefined,
      releaseCurrency && releaseCurrency.length > 0
        ? inArray(item_release.priceCurrency, releaseCurrency)
        : undefined,
      itemIdsWithEntries ? inArray(item.id, itemIdsWithEntries) : undefined,
      search ? ilike(item.title, `%${search}%`) : undefined
    );

    const sortByColumn = (() => {
      switch (sortBy) {
        case "itemTitle":
          return item.title;
        case "itemCategory":
          return item.category;
        case "itemScale":
          return item.scale;
        case "status":
          return collection.status;
        case "count":
          return collection.count;
        case "score":
          return collection.score;
        case "price":
          return collection.price;
        case "shop":
          return collection.shop;
        case "orderDate":
          return collection.orderDate;
        case "paymentDate":
          return collection.paymentDate;
        case "shippingDate":
          return collection.shippingDate;
        case "releaseDate":
          return item_release.date;
        case "collectionDate":
          return collection.collectionDate;
        case "createdAt":
          return collection.createdAt;
        default:
          return collection.createdAt;
      }
    })();

    const currentMonth = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1
    ).toISOString();
    const nextMonth = new Date(
      new Date().getFullYear(),
      new Date().getMonth() + 1,
      1
    ).toISOString();

    const collectionStats = await db
      .select({
        totalItems: count(
          sql`CASE WHEN ${collection.status} = 'Owned' THEN 1 END`
        ),
        totalSpent: sql<string>`COALESCE(${sum(collection.price)}, 0)`,
        totalItemsThisMonth: sql<number>`COALESCE(${count(
          sql`CASE WHEN ${collection.status} = 'Owned' 
              AND ${collection.collectionDate} >= ${currentMonth} 
              AND ${collection.collectionDate} < ${nextMonth}
              THEN 1 END`
        )}, 0)`,
        totalSpentThisMonth: sql<string>`COALESCE(${sum(
          sql`CASE WHEN ${collection.status} = 'Owned'
              AND ${collection.paymentDate} >= ${currentMonth} 
              AND ${collection.paymentDate} < ${nextMonth}
              THEN ${collection.price} ELSE 0 END`
        )}, 0)`,
      })
      .from(collection)
      .where(
        and(eq(collection.userId, userId), eq(collection.status, "Owned"))
      );

    const collectionItems = await db
      .select({
        id: collection.id,
        orderId: collection.orderId,
        itemId: item.id,
        itemTitle: item.title,
        itemImage: item.image,
        itemCategory: item.category,
        itemScale: item.scale,
        status: collection.status,
        count: collection.count,
        score: collection.score,
        price: collection.price,
        shop: collection.shop,
        condition: collection.condition,
        orderDate: collection.orderDate,
        paymentDate: collection.paymentDate,
        shippingDate: collection.shippingDate,
        collectionDate: collection.collectionDate,
        shippingMethod: collection.shippingMethod,
        tags: collection.tags,
        notes: collection.notes,
        releaseId: collection.releaseId,
        releaseDate: item_release.date,
        releasePrice: item_release.price,
        releaseCurrency: item_release.priceCurrency,
        releaseBarcode: item_release.barcode,
        releaseType: item_release.type,
        createdAt: collection.createdAt,
        updatedAt: collection.updatedAt,
        totalCount: sql<number>`COUNT(*) OVER()`,
        totalValue: sql<string>`COALESCE(SUM(${collection.price}) OVER(), 0)`,
      })
      .from(collection)
      .innerJoin(item, eq(collection.itemId, item.id))
      .leftJoin(item_release, eq(collection.releaseId, item_release.id))
      .where(filters)
      .orderBy(orderBy === "asc" ? asc(sortByColumn) : desc(sortByColumn))
      .limit(limit)
      .offset(offset);

    return { collectionItems, collectionStats: collectionStats[0] };
  }

  async getCollectionItem(userId: string, collectionId: string) {
    const collectionItem = await db
      .select({
        id: collection.id,
        orderId: collection.orderId,
        itemId: item.id,
        itemTitle: item.title,
        itemImage: item.image,
        itemCategory: item.category,
        itemScale: item.scale,
        status: collection.status,
        count: collection.count,
        score: collection.score,
        price: collection.price,
        shop: collection.shop,
        orderDate: collection.orderDate,
        paymentDate: collection.paymentDate,
        shippingDate: collection.shippingDate,
        collectionDate: collection.collectionDate,
        shippingMethod: collection.shippingMethod,
        tags: collection.tags,
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
      )
      .returning();

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
      )
      .returning();

    if (!deleted || deleted.length === 0) {
      throw new Error("COLLECTION_ITEMS_NOT_FOUND");
    }

    return {};
  }
}

export default new CollectionService();
