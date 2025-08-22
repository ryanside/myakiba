import { db } from "@/db";
import {
  collection,
  entry,
  entry_to_item,
  item,
  item_release,
} from "@/db/schema/figure";
import { and, eq, between, inArray, asc, desc } from "drizzle-orm";
import { type updateCollectionType } from "./model";

class CollectionService {
  async getCollection(
    userId: string,
    limit: number = 10,
    offset: number = 0,
    paid?: Array<string>,
    shop?: Array<string>,
    paymentDate?: Array<string>,
    shippingDate?: Array<string>,
    collectionDate?: Array<string>,
    shippingMethod?: Array<string>,
    shippingFee?: Array<string>,
    releaseDate?: Array<string>,
    releasePrice?: Array<string>,
    releaseCurrency?: Array<string>,
    category?: Array<string>,
    entries?: Array<string>,
    scale?: Array<string>,
    sort?: string,
    order?: string,
    group?: string
  ) {
    try {
      const sortColumn = (() => {
        switch (sort) {
          case "release":
            return item_release.date;
          case "paid":
            return collection.price;
          case "price":
            return item_release.price;
          case "score":
            return collection.score;
          case "payDate":
            return collection.paymentDate;
          case "shipDate":
            return collection.shippingDate;
          case "colDate":
            return collection.collectionDate;
          case "shipFee":
            return collection.shippingFee;
          case "height":
            return item.height;
          case "createdAt":
            return collection.createdAt;
          default:
            return collection.createdAt;
        }
      })();

      // If grouping is requested, return grouped results
      if (group) {
        return this.getGroupedCollection(
          userId,
          group,
          paid,
          shop,
          paymentDate,
          shippingDate,
          collectionDate,
          shippingMethod,
          shippingFee,
          releaseDate,
          releasePrice,
          releaseCurrency,
          category,
          entries,
          scale
        );
      }

      // Build the base query
      let query = db
        .select({
          collectionId: collection.id,
          itemId: item.id,
          title: item.title,
        })
        .from(collection)
        .innerJoin(item, eq(collection.itemId, item.id))
        .innerJoin(item_release, eq(collection.releaseId, item_release.id));

      // Add entry join and filter if entries are specified
      if (entries) {
        query = query
          .innerJoin(entry_to_item, eq(item.id, entry_to_item.itemId))
          .innerJoin(entry, eq(entry_to_item.entryId, entry.id));
      }

      const userCollection = await query
        .where(
          and(
            eq(collection.userId, userId),
            eq(collection.status, "Owned"),
            shop ? inArray(collection.shop, shop) : undefined,
            paid ? between(collection.price, paid[0], paid[1]) : undefined,
            paymentDate
              ? between(collection.paymentDate, paymentDate[0], paymentDate[1])
              : undefined,
            shippingDate
              ? between(
                  collection.shippingDate,
                  shippingDate[0],
                  shippingDate[1]
                )
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
            shippingFee
              ? between(collection.shippingFee, shippingFee[0], shippingFee[1])
              : undefined,
            releaseDate
              ? between(item_release.date, releaseDate[0], releaseDate[1])
              : undefined,
            releasePrice
              ? between(item_release.price, releasePrice[0], releasePrice[1])
              : undefined,
            releaseCurrency
              ? inArray(item_release.priceCurrency, releaseCurrency)
              : undefined,
            category ? inArray(item.category, category) : undefined,
            entries ? inArray(entry.name, entries) : undefined,
            scale ? inArray(item.scale, scale) : undefined
          )
        )
        .groupBy(collection.id, item.id, item_release.id) // Group to avoid duplicates from entry joins
        .orderBy(order === "asc" ? asc(sortColumn) : desc(sortColumn))
        .limit(limit)
        .offset(offset);

      return userCollection;
    } catch (error) {
      console.error("Failed to get collection");
      throw error;
    }
  }

  async getGroupedCollection(
    userId: string,
    groupBy: string,
    paid?: Array<string>,
    shop?: Array<string>,
    paymentDate?: Array<string>,
    shippingDate?: Array<string>,
    collectionDate?: Array<string>,
    shippingMethod?: Array<string>,
    shippingFee?: Array<string>,
    releaseDate?: Array<string>,
    releasePrice?: Array<string>,
    releaseCurrency?: Array<string>,
    category?: Array<string>,
    entries?: Array<string>,
    scale?: Array<string>
  ) {
    try {
      // Get the complete collection data with entry information
      const userCollectionWithEntries = await db
        .select({
          collectionId: collection.id,
          itemId: item.id,
          title: item.title,
          entryId: entry.id,
          entryName: entry.name,
          entryCategory: entry.category,
          entryRole: entry_to_item.role,
        })
        .from(collection)
        .where(
          and(
            eq(collection.userId, userId),
            eq(collection.status, "Owned"),
            eq(entry.category, groupBy), // Filter by the specific entry category we're grouping by
            shop ? inArray(collection.shop, shop) : undefined,
            paid ? between(collection.price, paid[0], paid[1]) : undefined,
            paymentDate
              ? between(collection.paymentDate, paymentDate[0], paymentDate[1])
              : undefined,
            shippingDate
              ? between(
                  collection.shippingDate,
                  shippingDate[0],
                  shippingDate[1]
                )
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
            shippingFee
              ? between(collection.shippingFee, shippingFee[0], shippingFee[1])
              : undefined,
            releaseDate
              ? between(item_release.date, releaseDate[0], releaseDate[1])
              : undefined,
            releasePrice
              ? between(item_release.price, releasePrice[0], releasePrice[1])
              : undefined,
            releaseCurrency
              ? inArray(item_release.priceCurrency, releaseCurrency)
              : undefined,
            category ? inArray(item.category, category) : undefined,
            entries ? inArray(entry.name, entries) : undefined,
            scale ? inArray(item.scale, scale) : undefined
          )
        )
        .innerJoin(item, eq(collection.itemId, item.id))
        .innerJoin(item_release, eq(collection.releaseId, item_release.id))
        .innerJoin(entry_to_item, eq(item.id, entry_to_item.itemId))
        .innerJoin(entry, eq(entry_to_item.entryId, entry.id));

      // Group the results by entry name
      const groupedResults: Record<
        string,
        Array<{ collectionId: string; itemId: number; title: string }>
      > = {};
      const groupCounts: Record<string, number> = {};

      for (const item of userCollectionWithEntries) {
        const groupKey = item.entryName;

        if (!groupedResults[groupKey]) {
          groupedResults[groupKey] = [];
          groupCounts[groupKey] = 0;
        }

        // Check if this collection item is already in the group (avoid duplicates due to multiple entries per item)
        const existingItem = groupedResults[groupKey].find(
          (existingItem) => existingItem.collectionId === item.collectionId
        );

        if (!existingItem) {
          const {
            entryId,
            entryName,
            entryCategory,
            entryRole,
            ...collectionItem
          } = item;

          groupedResults[groupKey].push(collectionItem);
          groupCounts[groupKey]++;
        }
      }

      // Format the response
      const formattedGroups = Object.entries(groupedResults).map(
        ([groupName, items]) => ({
          groupName,
          groupCategory: groupBy,
          count: groupCounts[groupName],
          items: items,
        })
      );

      return {
        groups: formattedGroups,
        totalGroups: Object.keys(groupedResults).length,
        groupBy,
      };
    } catch (error) {
      console.error("Failed to get grouped collection", error);
      throw error;
    }
  }

  async getCollectionItem(userId: string, id: string) {
    try {
      const [entries, itemReleases, collectionItem] = await db.batch([
        db
          .select({
            entryId: entry.id,
            entryName: entry.name,
            entryCategory: entry.category,
            entryRole: entry_to_item.role,
          })
          .from(collection)
          .where(and(eq(collection.id, id), eq(collection.userId, userId)))
          .innerJoin(entry_to_item, eq(collection.itemId, entry_to_item.itemId))
          .innerJoin(entry, eq(entry_to_item.entryId, entry.id))
          .groupBy(entry.category, entry_to_item.role, entry.id),
        db
          .select({
            releaseId: item_release.id,
            releaseDate: item_release.date,
            releasePrice: item_release.price,
            releaseCurrency: item_release.priceCurrency,
            releaseType: item_release.type,
            releaseBarcode: item_release.barcode,
          })
          .from(collection)
          .where(and(eq(collection.id, id), eq(collection.userId, userId)))
          .innerJoin(item_release, eq(collection.itemId, item_release.itemId))
          .orderBy(desc(item_release.date)),
        db
          .select()
          .from(collection)
          .where(and(eq(collection.id, id), eq(collection.userId, userId)))
          .innerJoin(item, eq(collection.itemId, item.id)),
      ]);

      return {
        entries,
        itemReleases,
        collectionItem,
      };
    } catch (error) {
      console.error("Failed to get collection item");
      throw error;
    }
  }

  async updateCollectionItem(
    userId: string,
    id: string,
    data: updateCollectionType
  ) {
    try {
      const updateCollection = db
        .update(collection)
        .set(data)
        .where(and(eq(collection.userId, userId), eq(collection.id, id)));

      return updateCollection;
    } catch (error) {
      console.error("Failed to update collection item");
      throw error;
    }
  }

  async deleteCollectionItem(userId: string, id: string) {
    try {
      const deleteCollection = db
        .delete(collection)
        .where(and(eq(collection.userId, userId), eq(collection.id, id)));
      return deleteCollection;
    } catch (error) {
      console.error("Failed to delete collection item");
      throw error;
    }
  }

  async deleteCollectionItems(userId: string, ids: string[]) {
    try {
      const deleteCollection = db
        .delete(collection)
        .where(and(eq(collection.userId, userId), inArray(collection.id, ids)));
      return deleteCollection;
    } catch (error) {
      console.error("Failed to delete collection items");
      throw error;
    }
  }
}

export default new CollectionService();
