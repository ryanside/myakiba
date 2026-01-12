import { db } from "@myakiba/db";
import { collection, item, entry, entry_to_item } from "@myakiba/db/schema/figure";
import { eq, count, and, sql, desc, not } from "drizzle-orm";

class AnalyticsService {
  private priceRangeDistributionPrepared;
  private scaleDistributionPrepared;
  private mostExpensiveCollectionItemsPrepared;
  private topShopsPrepared;
  private totalOwnedPrepared;
  private topCharactersPrepared;
  private topOriginsPrepared;
  private topCompaniesPrepared;
  private topArtistsPrepared;
  private topMaterialsPrepared;
  private topClassificationsPrepared;
  private topEventsPrepared;

  constructor() {
    // Price Range Distribution
    this.priceRangeDistributionPrepared = db
      .select({
        priceRange: sql<string>`
          CASE 
            WHEN ${collection.price}::numeric < 50 THEN '< $50'
            WHEN ${collection.price}::numeric < 100 THEN '$50-$100'
            WHEN ${collection.price}::numeric < 200 THEN '$100-$200'
            WHEN ${collection.price}::numeric < 500 THEN '$200-$500'
            ELSE '> $500'
          END
        `,
        count: count(),
        totalValue: sql<string>`SUM(${collection.price}::numeric)`,
      })
      .from(collection)
      .where(
        and(
          eq(collection.userId, sql.placeholder("userId")),
          eq(collection.status, "Owned")
        )
      )
      .groupBy(
        sql`
        CASE 
          WHEN ${collection.price}::numeric < 50 THEN '< $50'
          WHEN ${collection.price}::numeric < 100 THEN '$50-$100'
          WHEN ${collection.price}::numeric < 200 THEN '$100-$200'
          WHEN ${collection.price}::numeric < 500 THEN '$200-$500'
          ELSE '> $500'
        END
      `
      )
      .orderBy(sql`MIN(${collection.price}::numeric)`)
      .prepare("price_range_distribution");

    // Scale Distribution
    this.scaleDistributionPrepared = db
      .select({
        scale: item.scale,
        count: count(),
        totalValue: sql<string>`SUM(${collection.price}::numeric)`,
      })
      .from(collection)
      .innerJoin(item, eq(collection.itemId, item.id))
      .where(
        and(
          eq(collection.userId, sql.placeholder("userId")),
          eq(collection.status, "Owned"),
          eq(item.category, "Prepainted")
        )
      )
      .groupBy(item.scale)
      .orderBy(sql`COUNT(*) DESC`)
      .limit(10)
      .prepare("scale_distribution");

    // Most Expensive Collection Items
    this.mostExpensiveCollectionItemsPrepared = db
      .select({
        itemId: item.id,
        itemTitle: item.title,
        itemImage: item.image,
        itemCategory: item.category,
        collectionPrice: collection.price,
      })
      .from(collection)
      .innerJoin(item, eq(collection.itemId, item.id))
      .where(
        and(
          eq(collection.userId, sql.placeholder("userId")),
          eq(collection.status, "Owned")
        )
      )
      .orderBy(desc(collection.price))
      .limit(10)
      .prepare("most_expensive_items");

    // Top Shops
    this.topShopsPrepared = db
      .select({
        shop: collection.shop,
        count: count(),
        totalSpent: sql<string>`SUM(${collection.price}::numeric)`,
      })
      .from(collection)
      .where(
        and(
          eq(collection.userId, sql.placeholder("userId")),
          not(eq(collection.shop, ""))
        )
      )
      .groupBy(collection.shop)
      .orderBy(
        desc(count()),
        desc(sql<string>`SUM(${collection.price}::numeric)`)
      )
      .limit(10)
      .prepare("top_shops");

    // Total Owned
    this.totalOwnedPrepared = db
      .select({
        count: count(),
      })
      .from(collection)
      .where(
        and(
          eq(collection.userId, sql.placeholder("userId")),
          eq(collection.status, "Owned")
        )
      )
      .prepare("total_owned");

    // Top Characters
    this.topCharactersPrepared = db
      .select({
        entryId: entry.id,
        originName: entry.name,
        itemCount: count(),
        totalValue: sql<string>`SUM(${collection.price}::numeric)`,
      })
      .from(collection)
      .innerJoin(entry_to_item, eq(collection.itemId, entry_to_item.itemId))
      .innerJoin(entry, eq(entry_to_item.entryId, entry.id))
      .where(
        and(
          eq(collection.userId, sql.placeholder("userId")),
          eq(collection.status, "Owned"),
          eq(entry.category, "Characters")
        )
      )
      .groupBy(entry.id, entry.name)
      .orderBy(
        desc(count()),
        desc(sql<string>`SUM(${collection.price}::numeric)`)
      )
      .limit(10)
      .prepare("top_characters");

    // Top Origins
    this.topOriginsPrepared = db
      .select({
        entryId: entry.id,
        originName: entry.name,
        itemCount: count(),
        totalValue: sql<string>`SUM(${collection.price}::numeric)`,
      })
      .from(collection)
      .innerJoin(entry_to_item, eq(collection.itemId, entry_to_item.itemId))
      .innerJoin(entry, eq(entry_to_item.entryId, entry.id))
      .where(
        and(
          eq(collection.userId, sql.placeholder("userId")),
          eq(collection.status, "Owned"),
          eq(entry.category, "Origins")
        )
      )
      .groupBy(entry.id, entry.name)
      .orderBy(
        desc(count()),
        desc(sql<string>`SUM(${collection.price}::numeric)`)
      )
      .limit(10)
      .prepare("top_origins");

    // Top Companies
    this.topCompaniesPrepared = db
      .select({
        entryId: entry.id,
        originName: entry.name,
        itemCount: count(),
        totalValue: sql<string>`SUM(${collection.price}::numeric)`,
      })
      .from(collection)
      .innerJoin(entry_to_item, eq(collection.itemId, entry_to_item.itemId))
      .innerJoin(entry, eq(entry_to_item.entryId, entry.id))
      .where(
        and(
          eq(collection.userId, sql.placeholder("userId")),
          eq(collection.status, "Owned"),
          eq(entry.category, "Companies")
        )
      )
      .groupBy(entry.id, entry.name)
      .orderBy(
        desc(count()),
        desc(sql<string>`SUM(${collection.price}::numeric)`)
      )
      .limit(10)
      .prepare("top_companies");

    // Top Artists
    this.topArtistsPrepared = db
      .select({
        entryId: entry.id,
        originName: entry.name,
        itemCount: count(),
        totalValue: sql<string>`SUM(${collection.price}::numeric)`,
      })
      .from(collection)
      .innerJoin(entry_to_item, eq(collection.itemId, entry_to_item.itemId))
      .innerJoin(entry, eq(entry_to_item.entryId, entry.id))
      .where(
        and(
          eq(collection.userId, sql.placeholder("userId")),
          eq(collection.status, "Owned"),
          eq(entry.category, "Artists")
        )
      )
      .groupBy(entry.id, entry.name)
      .orderBy(
        desc(count()),
        desc(sql<string>`SUM(${collection.price}::numeric)`)
      )
      .limit(10)
      .prepare("top_artists");

    // Top Materials
    this.topMaterialsPrepared = db
      .select({
        entryId: entry.id,
        originName: entry.name,
        itemCount: count(),
        totalValue: sql<string>`SUM(${collection.price}::numeric)`,
      })
      .from(collection)
      .innerJoin(entry_to_item, eq(collection.itemId, entry_to_item.itemId))
      .innerJoin(entry, eq(entry_to_item.entryId, entry.id))
      .where(
        and(
          eq(collection.userId, sql.placeholder("userId")),
          eq(collection.status, "Owned"),
          eq(entry.category, "Materials")
        )
      )
      .groupBy(entry.id, entry.name)
      .orderBy(
        desc(count()),
        desc(sql<string>`SUM(${collection.price}::numeric)`)
      )
      .limit(10)
      .prepare("top_materials");

    // Top Classifications
    this.topClassificationsPrepared = db
      .select({
        entryId: entry.id,
        originName: entry.name,
        itemCount: count(),
        totalValue: sql<string>`SUM(${collection.price}::numeric)`,
      })
      .from(collection)
      .innerJoin(entry_to_item, eq(collection.itemId, entry_to_item.itemId))
      .innerJoin(entry, eq(entry_to_item.entryId, entry.id))
      .where(
        and(
          eq(collection.userId, sql.placeholder("userId")),
          eq(collection.status, "Owned"),
          eq(entry.category, "Classifications")
        )
      )
      .groupBy(entry.id, entry.name)
      .orderBy(
        desc(count()),
        desc(sql<string>`SUM(${collection.price}::numeric)`)
      )
      .limit(10)
      .prepare("top_classifications");

    // Top Events
    this.topEventsPrepared = db
      .select({
        entryId: entry.id,
        originName: entry.name,
        itemCount: count(),
        totalValue: sql<string>`SUM(${collection.price}::numeric)`,
      })
      .from(collection)
      .innerJoin(entry_to_item, eq(collection.itemId, entry_to_item.itemId))
      .innerJoin(entry, eq(entry_to_item.entryId, entry.id))
      .where(
        and(
          eq(collection.userId, sql.placeholder("userId")),
          eq(collection.status, "Owned"),
          eq(entry.category, "Event")
        )
      )
      .groupBy(entry.id, entry.name)
      .orderBy(
        desc(count()),
        desc(sql<string>`SUM(${collection.price}::numeric)`)
      )
      .limit(10)
      .prepare("top_events");
  }

  async getAnalytics(userId: string) {
    const [
      priceRangeDistribution,
      scaleDistribution,
      mostExpensiveCollectionItems,
      topShops,
      totalOwned,
      topCharacters,
      topOrigins,
      topCompanies,
      topArtists,
      topMaterials,
      topClassifications,
      topEvents,
    ] = await Promise.all([
      this.priceRangeDistributionPrepared.execute({ userId }),
      this.scaleDistributionPrepared.execute({ userId }),
      this.mostExpensiveCollectionItemsPrepared.execute({ userId }),
      this.topShopsPrepared.execute({ userId }),
      this.totalOwnedPrepared.execute({ userId }),
      this.topCharactersPrepared.execute({ userId }),
      this.topOriginsPrepared.execute({ userId }),
      this.topCompaniesPrepared.execute({ userId }),
      this.topArtistsPrepared.execute({ userId }),
      this.topMaterialsPrepared.execute({ userId }),
      this.topClassificationsPrepared.execute({ userId }),
      this.topEventsPrepared.execute({ userId }),
    ]);

    const topEntriesByAllCategories = {
      Characters: topCharacters,
      Origins: topOrigins,
      Companies: topCompanies,
      Artists: topArtists,
      Materials: topMaterials,
      Classifications: topClassifications,
      Event: topEvents,
    };

    return {
      priceRangeDistribution,
      scaleDistribution,
      mostExpensiveCollectionItems,
      topShops,
      totalOwned,
      topEntriesByAllCategories,
    };
  }
}

export default new AnalyticsService();
