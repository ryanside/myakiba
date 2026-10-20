import { and, asc, eq, exists, gte, lte, sql } from "drizzle-orm";
import { collection, item, item_release, order } from "@myakiba/db/schema/figure";
import { getDateOnlyMonthBounds } from "@myakiba/utils/date-only";
import { orderPreviewImagesSql } from "@/lib/order-preview";
import { ok, query } from "@/domain/kernel";
import type { CalendarQuery } from "./model";

export const Calendar = {
  items: query(
    { action: "calendar.get", failure: "Failed to get calendar items" },
    async (scope, input: CalendarQuery) => {
      scope.log.set({ calendar: { view: input.view, month: input.month, year: input.year } });
      const { start, end } = getDateOnlyMonthBounds(input.year, input.month);

      const items = await scope.tx
        .select({
          releaseId: item_release.id,
          itemId: item.id,
          itemExternalId: item.externalId,
          title: item.title,
          image: item.image,
          category: item.category,
          price: item_release.price,
          priceCurrency: item_release.priceCurrency,
          releaseDate: item_release.date,
        })
        .from(item_release)
        .innerJoin(item, eq(item_release.itemId, item.id))
        .where(
          and(
            gte(item_release.date, start),
            lte(item_release.date, end),
            exists(
              scope.tx
                .select({ collectionId: collection.id })
                .from(collection)
                .where(
                  and(
                    eq(collection.userId, scope.viewer.userId),
                    eq(collection.itemId, item.id),
                    eq(collection.releaseId, item_release.id),
                  ),
                ),
            ),
          ),
        )
        .orderBy(asc(item_release.date), asc(item.title), asc(item.id), asc(item_release.id));

      scope.log.set({ calendar: { resultCount: items.length } });
      const result = { view: "items" as const, month: input.month, year: input.year, items };
      return ok(result);
    },
  ),

  orders: query(
    { action: "calendar.get", failure: "Failed to get calendar orders" },
    async (scope, input: CalendarQuery) => {
      scope.log.set({ calendar: { view: input.view, month: input.month, year: input.year } });
      const { start, end } = getDateOnlyMonthBounds(input.year, input.month);

      const rows = await scope.tx
        .select({
          orderId: order.id,
          title: order.title,
          shop: order.shop,
          status: order.status,
          releaseDate: order.releaseDate,
          itemCount: sql<number>`COUNT(${collection.id})`,
          images: orderPreviewImagesSql,
          total: sql<number>`COALESCE(SUM(${collection.price}), 0) + COALESCE(${order.shippingFee}, 0) + COALESCE(${order.taxes}, 0) + COALESCE(${order.duties}, 0) + COALESCE(${order.tariffs}, 0) + COALESCE(${order.miscFees}, 0)`,
        })
        .from(order)
        .leftJoin(collection, eq(order.id, collection.orderId))
        .where(
          and(
            eq(order.userId, scope.viewer.userId),
            gte(order.releaseDate, start),
            lte(order.releaseDate, end),
          ),
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
        .orderBy(asc(order.releaseDate), asc(order.title), asc(order.id));

      const orders = rows.map((row) => ({ ...row, images: row.images.slice(0, 4) }));
      scope.log.set({ calendar: { resultCount: orders.length } });
      const result = { view: "orders" as const, month: input.month, year: input.year, orders };
      return ok(result);
    },
  ),
};
