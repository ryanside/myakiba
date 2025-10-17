import { db } from "@/db";
import {
  collection,
  entry,
  entry_to_item,
  item,
  item_release,
} from "@/db/schema/figure";
import { and, eq, between, inArray, arrayContains, desc } from "drizzle-orm";
import type {
  GroupingType,
  GalleryResponse,
  GalleryItem,
  GalleryGroup,
} from "./model";
import type { SQL } from "drizzle-orm";

class GalleryService {
  async getGallery(
    userId: string,
    groupBy?: GroupingType,
    paid?: Array<string>,
    shop?: Array<string>,
    paymentDate?: Array<string>,
    shippingDate?: Array<string>,
    collectionDate?: Array<string>,
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
    releaseDate?: Array<string>,
    releasePrice?: Array<string>,
    releaseCurrency?: Array<string>,
    category?: Array<string>,
    entries?: Array<string>,
    scale?: Array<string>,
    tags?: Array<string>,
    condition?: Array<"New" | "Pre-Owned">
  ): Promise<GalleryResponse> {
    // Build common filters for all queries
    const commonFilters = and(
      eq(collection.userId, userId),
      eq(collection.status, "Owned"),
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
      condition ? inArray(collection.condition, condition) : undefined
    );

    // Handle ungrouped default view
    if (!groupBy) {
      return this.getUngroupedGallery(
        commonFilters,
        releaseDate,
        releasePrice,
        releaseCurrency
      );
    }

    // Handle entry-based grouping (Origins, Characters, etc.)
    if (
      [
        "Origins",
        "Characters",
        "Companies",
        "Artists",
        "Classifications",
      ].includes(groupBy)
    ) {
      return this.getEntryGroupedGallery(
        groupBy,
        commonFilters,
        entries,
        releaseDate,
        releasePrice,
        releaseCurrency
      );
    }

    // Handle other grouping types
    switch (groupBy) {
      case "category":
        return this.getCategoryGroupedGallery(
          commonFilters,
          releaseDate,
          releasePrice,
          releaseCurrency
        );
      case "scale":
        return this.getScaleGroupedGallery(
          commonFilters,
          releaseDate,
          releasePrice,
          releaseCurrency
        );
      case "release":
        return this.getReleaseGroupedGallery(
          commonFilters,
          releaseDate,
          releasePrice,
          releaseCurrency
        );
      case "score":
        return this.getScoreGroupedGallery(
          commonFilters,
          releaseDate,
          releasePrice,
          releaseCurrency
        );
      default:
        throw new Error("UNSUPPORTED_GROUPING_TYPE");
    }
  }

  private async getUngroupedGallery(
    commonFilters: SQL<unknown> | undefined,
    releaseDate?: Array<string>,
    releasePrice?: Array<string>,
    releaseCurrency?: Array<string>
  ) {
    const items = await db
      .select({
        collectionId: collection.id,
        itemId: item.id,
        image: item.image,
        title: item.title,
        category: item.category,
        scale: item.scale,
        score: collection.score,
        releaseDate: item_release.date,
        releasePrice: item_release.price,
        releaseCurrency: item_release.priceCurrency,
      })
      .from(collection)
      .innerJoin(item, eq(collection.itemId, item.id))
      .leftJoin(item_release, eq(collection.releaseId, item_release.id))
      .where(
        and(
          commonFilters,
          releaseDate
            ? between(item_release.date, releaseDate[0], releaseDate[1])
            : undefined,
          releasePrice
            ? between(item_release.price, releasePrice[0], releasePrice[1])
            : undefined,
          releaseCurrency
            ? inArray(item_release.priceCurrency, releaseCurrency)
            : undefined
        )
      )
      .orderBy(desc(collection.createdAt));

    return {
      items: items as GalleryItem[],
      totalItems: items.length,
      groupBy: null,
    };
  }

  private async getEntryGroupedGallery(
    groupBy: string,
    commonFilters: SQL<unknown> | undefined,
    entries?: Array<string>,
    releaseDate?: Array<string>,
    releasePrice?: Array<string>,
    releaseCurrency?: Array<string>
  ) {
    const userCollectionWithEntries = await db
      .select({
        collectionId: collection.id,
        itemId: item.id,
        image: item.image,
        title: item.title,
        category: item.category,
        scale: item.scale,
        score: collection.score,
        releaseDate: item_release.date,
        releasePrice: item_release.price,
        releaseCurrency: item_release.priceCurrency,
        entryName: entry.name,
      })
      .from(collection)
      .innerJoin(item, eq(collection.itemId, item.id))
      .leftJoin(item_release, eq(collection.releaseId, item_release.id))
      .innerJoin(entry_to_item, eq(item.id, entry_to_item.itemId))
      .innerJoin(entry, eq(entry_to_item.entryId, entry.id))
      .where(
        and(
          commonFilters,
          eq(entry.category, groupBy),
          entries ? inArray(entry.name, entries) : undefined,
          releaseDate
            ? between(item_release.date, releaseDate[0], releaseDate[1])
            : undefined,
          releasePrice
            ? between(item_release.price, releasePrice[0], releasePrice[1])
            : undefined,
          releaseCurrency
            ? inArray(item_release.priceCurrency, releaseCurrency)
            : undefined
        )
      );

    return this.groupEntryResults(userCollectionWithEntries, groupBy);
  }

  private async getCategoryGroupedGallery(
    commonFilters: SQL<unknown> | undefined,
    releaseDate?: Array<string>,
    releasePrice?: Array<string>,
    releaseCurrency?: Array<string>
  ) {
    const items = await db
      .select({
        collectionId: collection.id,
        itemId: item.id,
        image: item.image,
        title: item.title,
        category: item.category,
        scale: item.scale,
        score: collection.score,
        releaseDate: item_release.date,
        releasePrice: item_release.price,
        releaseCurrency: item_release.priceCurrency,
      })
      .from(collection)
      .innerJoin(item, eq(collection.itemId, item.id))
      .leftJoin(item_release, eq(collection.releaseId, item_release.id))
      .where(
        and(
          commonFilters,
          releaseDate
            ? between(item_release.date, releaseDate[0], releaseDate[1])
            : undefined,
          releasePrice
            ? between(item_release.price, releasePrice[0], releasePrice[1])
            : undefined,
          releaseCurrency
            ? inArray(item_release.priceCurrency, releaseCurrency)
            : undefined
        )
      );

    return this.groupResults(
      items,
      "category",
      (item) => item.category || "Uncategorized"
    );
  }

  private async getScaleGroupedGallery(
    commonFilters: SQL<unknown> | undefined,
    releaseDate?: Array<string>,
    releasePrice?: Array<string>,
    releaseCurrency?: Array<string>
  ) {
    const items = await db
      .select({
        collectionId: collection.id,
        itemId: item.id,
        image: item.image,
        title: item.title,
        category: item.category,
        scale: item.scale,
        score: collection.score,
        releaseDate: item_release.date,
        releasePrice: item_release.price,
        releaseCurrency: item_release.priceCurrency,
      })
      .from(collection)
      .innerJoin(item, eq(collection.itemId, item.id))
      .leftJoin(item_release, eq(collection.releaseId, item_release.id))
      .where(
        and(
          commonFilters,
          releaseDate
            ? between(item_release.date, releaseDate[0], releaseDate[1])
            : undefined,
          releasePrice
            ? between(item_release.price, releasePrice[0], releasePrice[1])
            : undefined,
          releaseCurrency
            ? inArray(item_release.priceCurrency, releaseCurrency)
            : undefined
        )
      );

    return this.groupResults(
      items,
      "scale",
      (item) => item.scale || "Unknown Scale"
    );
  }

  private async getReleaseGroupedGallery(
    commonFilters: SQL<unknown> | undefined,
    releaseDate?: Array<string>,
    releasePrice?: Array<string>,
    releaseCurrency?: Array<string>
  ) {
    const items = await db
      .select({
        collectionId: collection.id,
        itemId: item.id,
        image: item.image,
        title: item.title,
        category: item.category,
        scale: item.scale,
        score: collection.score,
        releaseDate: item_release.date,
        releasePrice: item_release.price,
        releaseCurrency: item_release.priceCurrency,
      })
      .from(collection)
      .innerJoin(item, eq(collection.itemId, item.id))
      .innerJoin(item_release, eq(collection.releaseId, item_release.id))
      .where(
        and(
          commonFilters,
          releaseDate
            ? between(item_release.date, releaseDate[0], releaseDate[1])
            : undefined,
          releasePrice
            ? between(item_release.price, releasePrice[0], releasePrice[1])
            : undefined,
          releaseCurrency
            ? inArray(item_release.priceCurrency, releaseCurrency)
            : undefined
        )
      );

    return this.groupResults(
      items,
      "release",
      (item) => item.releaseDate || "Unknown Release"
    );
  }

  private async getScoreGroupedGallery(
    commonFilters: SQL<unknown> | undefined,
    releaseDate?: Array<string>,
    releasePrice?: Array<string>,
    releaseCurrency?: Array<string>
  ) {
    const items = await db
      .select({
        collectionId: collection.id,
        itemId: item.id,
        image: item.image,
        title: item.title,
        category: item.category,
        scale: item.scale,
        score: collection.score,
        releaseDate: item_release.date,
        releasePrice: item_release.price,
        releaseCurrency: item_release.priceCurrency,
      })
      .from(collection)
      .innerJoin(item, eq(collection.itemId, item.id))
      .leftJoin(item_release, eq(collection.releaseId, item_release.id))
      .where(
        and(
          commonFilters,
          releaseDate
            ? between(item_release.date, releaseDate[0], releaseDate[1])
            : undefined,
          releasePrice
            ? between(item_release.price, releasePrice[0], releasePrice[1])
            : undefined,
          releaseCurrency
            ? inArray(item_release.priceCurrency, releaseCurrency)
            : undefined
        )
      );

    return this.groupResults(items, "score", (item) => {
      if (!item.score) return "Unrated";
      const score = parseFloat(item.score);
      if (score >= 9) return "9.0 - 10.0";
      if (score >= 8) return "8.0 - 8.9";
      if (score >= 7) return "7.0 - 7.9";
      if (score >= 6) return "6.0 - 6.9";
      if (score >= 5) return "5.0 - 5.9";
      return "Below 5.0";
    });
  }

  private groupResults(
    items: any[],
    groupBy: string,
    getGroupKey: (item: any) => string
  ) {
    const groupedResults: Record<string, GalleryItem[]> = {};
    const seenCollectionIds = new Set<string>();

    for (const item of items) {
      // Avoid duplicates when items have multiple entries
      if (seenCollectionIds.has(item.collectionId)) {
        continue;
      }
      seenCollectionIds.add(item.collectionId);

      const groupKey = getGroupKey(item);

      if (!groupedResults[groupKey]) {
        groupedResults[groupKey] = [];
      }

      const { entryName, ...galleryItem } = item;
      groupedResults[groupKey].push(galleryItem as GalleryItem);
    }

    const formattedGroups: GalleryGroup[] = Object.entries(groupedResults).map(
      ([groupName, items]) => ({
        groupName,
        groupCategory: groupBy,
        count: items.length,
        items,
      })
    );

    return {
      groups: formattedGroups,
      totalGroups: formattedGroups.length,
      groupBy: groupBy as GroupingType,
    };
  }

  private groupEntryResults(items: any[], groupBy: string) {
    const groupedResults: Record<string, GalleryItem[]> = {};
    const groupCollectionIds: Record<string, Set<string>> = {};

    for (const item of items) {
      const groupKey = item.entryName;

      if (!groupedResults[groupKey]) {
        groupedResults[groupKey] = [];
        groupCollectionIds[groupKey] = new Set<string>();
      }

      // Only add item to this group if we haven't seen this collection ID in this specific group
      if (!groupCollectionIds[groupKey].has(item.collectionId)) {
        groupCollectionIds[groupKey].add(item.collectionId);

        const { entryName, ...galleryItem } = item;
        groupedResults[groupKey].push(galleryItem as GalleryItem);
      }
    }

    const formattedGroups: GalleryGroup[] = Object.entries(groupedResults).map(
      ([groupName, items]) => ({
        groupName,
        groupCategory: groupBy,
        count: items.length,
        items,
      })
    );

    return {
      groups: formattedGroups,
      totalGroups: formattedGroups.length,
      groupBy: groupBy as GroupingType,
    };
  }
}

export default new GalleryService();
