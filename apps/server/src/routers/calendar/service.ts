import { db } from "@myakiba/db/client";
import { collection, item, item_release, order } from "@myakiba/db/schema/figure";
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { toDateOnlyString } from "@myakiba/utils/date-only";

function monthBounds(month: number, year: number): { start: string; end: string } {
  const start = toDateOnlyString(new Date(year, month - 1, 1));
  const end = toDateOnlyString(new Date(year, month, 0));
  if (!start || !end) {
    throw new Error("INVALID_MONTH_OR_YEAR");
  }
  return { start, end };
}

class CalendarService {
  async getItems(userId: string, month: number, year: number) {
    const { start, end } = monthBounds(month, year);

    const rows = await db
      .select({
        collectionId: collection.id,
        itemId: item.id,
        itemExternalId: item.externalId,
        title: item.title,
        image: item.image,
        category: item.category,
        price: item_release.price,
        priceCurrency: item_release.priceCurrency,
        releaseDate: item_release.date,
      })
      .from(collection)
      .innerJoin(item, eq(collection.itemId, item.id))
      .innerJoin(item_release, eq(collection.releaseId, item_release.id))
      .where(
        and(
          eq(collection.userId, userId),
          gte(item_release.date, start),
          lte(item_release.date, end),
        ),
      )
      .orderBy(asc(item_release.date), asc(item.title));

    return rows;
  }

  async getOrders(userId: string, month: number, year: number) {
    const { start, end } = monthBounds(month, year);

    const rows = await db
      .select({
        orderId: order.id,
        title: order.title,
        shop: order.shop,
        status: order.status,
        releaseDate: order.releaseDate,
        itemCount: sql<number>`COUNT(${collection.id})`,
        images: sql<
          string[]
        >`COALESCE(ARRAY_AGG(DISTINCT ${item.image}) FILTER (WHERE ${item.image} IS NOT NULL), ARRAY[]::text[])`,
        total: sql<number>`COALESCE(SUM(${collection.price}), 0) + COALESCE(${order.shippingFee}, 0) + COALESCE(${order.taxes}, 0) + COALESCE(${order.duties}, 0) + COALESCE(${order.tariffs}, 0) + COALESCE(${order.miscFees}, 0)`,
      })
      .from(order)
      .leftJoin(collection, eq(order.id, collection.orderId))
      .leftJoin(item, eq(collection.itemId, item.id))
      .where(
        and(eq(order.userId, userId), gte(order.releaseDate, start), lte(order.releaseDate, end)),
      )
      .groupBy(
        order.id,
        order.title,
        order.shop,
        order.status,
        order.releaseDate,
        order.shippingFee,
        order.taxes,
        order.duties,
        order.tariffs,
        order.miscFees,
      )
      .orderBy(asc(order.releaseDate), asc(order.title));

    return rows.map((row) => ({
      ...row,
      images: row.images.slice(0, 4),
    }));
  }
}

export default new CalendarService();
