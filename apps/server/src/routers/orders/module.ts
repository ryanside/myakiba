import { and, asc, eq, gte, ilike, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { advanceOrderReleaseDatesForCollectionItems } from "@myakiba/db/order-release-date";
import { collection, item, item_release, order } from "@myakiba/db/schema/figure";
import type { Tx } from "@myakiba/db/tx";
import type { CascadeOptions, NewOrder, OrderItemsQuery } from "@myakiba/contracts/orders/schema";
import type { Order } from "@myakiba/contracts/orders/types";
import { orderPreviewImagesSql } from "@/lib/order-preview";
import { command, fail, ok, paginate, query } from "@/domain/kernel";
import type { OrderUpdateType, OrdersQuery } from "./model";

const orderTotal =
  sql<number>`COALESCE(SUM(${collection.price}), 0) + COALESCE(${order.shippingFee}, 0) + COALESCE(${order.taxes}, 0) + COALESCE(${order.duties}, 0) + COALESCE(${order.tariffs}, 0) + COALESCE(${order.miscFees}, 0)`.mapWith(
    Number,
  );
const itemCount = sql<number>`COUNT(${collection.id})::integer`;
const realizedOrderDate = sql`COALESCE(${order.paymentDate}, ${order.collectionDate}, ${order.shippingDate}, ${order.orderDate}, ${order.releaseDate})`;

function listFilters(userId: string, filters: OrdersQuery): SQL | undefined {
  return and(
    eq(order.userId, userId),
    filters.search ? ilike(order.title, `%${filters.search}%`) : undefined,
    filters.shop ? inArray(order.shop, filters.shop) : undefined,
    filters.releaseDateStart ? gte(order.releaseDate, filters.releaseDateStart) : undefined,
    filters.releaseDateEnd ? lte(order.releaseDate, filters.releaseDateEnd) : undefined,
    filters.shipMethod ? inArray(order.shippingMethod, filters.shipMethod) : undefined,
    filters.orderDateStart ? gte(order.orderDate, filters.orderDateStart) : undefined,
    filters.orderDateEnd ? lte(order.orderDate, filters.orderDateEnd) : undefined,
    filters.payDateStart ? gte(order.paymentDate, filters.payDateStart) : undefined,
    filters.payDateEnd ? lte(order.paymentDate, filters.payDateEnd) : undefined,
    filters.expenseDateStart ? gte(realizedOrderDate, filters.expenseDateStart) : undefined,
    filters.expenseDateEnd ? lte(realizedOrderDate, filters.expenseDateEnd) : undefined,
    filters.shipDateStart ? gte(order.shippingDate, filters.shipDateStart) : undefined,
    filters.shipDateEnd ? lte(order.shippingDate, filters.shipDateEnd) : undefined,
    filters.colDateStart ? gte(order.collectionDate, filters.colDateStart) : undefined,
    filters.colDateEnd ? lte(order.collectionDate, filters.colDateEnd) : undefined,
    filters.status ? inArray(order.status, filters.status) : undefined,
    filters.shippingFeeMin === undefined
      ? undefined
      : gte(order.shippingFee, filters.shippingFeeMin),
    filters.shippingFeeMax === undefined
      ? undefined
      : lte(order.shippingFee, filters.shippingFeeMax),
    filters.taxesMin === undefined ? undefined : gte(order.taxes, filters.taxesMin),
    filters.taxesMax === undefined ? undefined : lte(order.taxes, filters.taxesMax),
    filters.dutiesMin === undefined ? undefined : gte(order.duties, filters.dutiesMin),
    filters.dutiesMax === undefined ? undefined : lte(order.duties, filters.dutiesMax),
    filters.tariffsMin === undefined ? undefined : gte(order.tariffs, filters.tariffsMin),
    filters.tariffsMax === undefined ? undefined : lte(order.tariffs, filters.tariffsMax),
    filters.miscFeesMin === undefined ? undefined : gte(order.miscFees, filters.miscFeesMin),
    filters.miscFeesMax === undefined ? undefined : lte(order.miscFees, filters.miscFeesMax),
  );
}

/** An empty request finds nothing, so it still answers 404. */
function foundAll(ids: readonly string[], touched: number): boolean {
  return touched > 0 && touched === new Set(ids).size;
}

/** Detaches the Owned items and deletes the rest. Returns how many rows it touched. */
async function removeItems(
  tx: Tx,
  userId: string,
  collectionIds: string[],
  orderId?: string,
): Promise<number> {
  const selected = and(
    eq(collection.userId, userId),
    inArray(collection.id, collectionIds),
    orderId === undefined ? undefined : eq(collection.orderId, orderId),
  );

  const detached = await tx
    .update(collection)
    .set({ orderId: null })
    .where(and(selected, eq(collection.status, "Owned")))
    .returning({ id: collection.id });
  const deleted = await tx
    .delete(collection)
    .where(and(selected, ne(collection.status, "Owned")))
    .returning({ id: collection.id });

  return detached.length + deleted.length;
}

export const Orders = {
  list: query(
    { action: "orders.list", failure: "Failed to get orders" },
    async (scope, input: OrdersQuery) => {
      const select = {
        orderId: order.id,
        title: order.title,
        shop: order.shop,
        releaseDate: order.releaseDate,
        shippingMethod: order.shippingMethod,
        orderDate: order.orderDate,
        paymentDate: order.paymentDate,
        shippingDate: order.shippingDate,
        collectionDate: order.collectionDate,
        status: order.status,
        total: orderTotal,
        shippingFee: order.shippingFee,
        taxes: order.taxes,
        duties: order.duties,
        tariffs: order.tariffs,
        miscFees: order.miscFees,
        notes: order.notes,
        itemCount,
        images: orderPreviewImagesSql,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      };
      const rows = (fields: typeof select) =>
        scope.tx
          .select(fields)
          .from(order)
          .leftJoin(collection, eq(order.id, collection.orderId))
          .where(listFilters(scope.viewer.userId, input))
          .groupBy(
            order.id,
            order.title,
            order.shop,
            order.releaseDate,
            order.shippingMethod,
            order.orderDate,
            order.paymentDate,
            order.shippingDate,
            order.collectionDate,
            order.status,
            order.shippingFee,
            order.taxes,
            order.duties,
            order.tariffs,
            order.miscFees,
            order.notes,
            order.createdAt,
            order.updatedAt,
          )
          .having(
            and(
              input.totalMin === undefined ? undefined : sql`${orderTotal} >= ${input.totalMin}`,
              input.totalMax === undefined ? undefined : sql`${orderTotal} <= ${input.totalMax}`,
            ),
          )
          .$dynamic();

      const page = await paginate(scope, input, {
        select,
        rows,
        sortBy: {
          title: order.title,
          shop: sql`LOWER(${order.shop})`,
          orderDate: order.orderDate,
          paymentDate: order.paymentDate,
          shippingDate: order.shippingDate,
          collectionDate: order.collectionDate,
          releaseDate: order.releaseDate,
          shippingMethod: order.shippingMethod,
          total: orderTotal,
          shippingFee: order.shippingFee,
          taxes: order.taxes,
          duties: order.duties,
          tariffs: order.tariffs,
          miscFees: order.miscFees,
          status: order.status,
          itemCount,
          createdAt: order.createdAt,
        },
        tiebreak: [order.createdAt, order.id],
        totals: {
          totalSpent: { sum: orderTotal, where: ne(order.status, "Ordered") },
          activeOrders: { count: ne(order.status, "Owned") },
          unpaidCosts: { sum: orderTotal, where: eq(order.status, "Ordered") },
        },
      });

      const orders = {
        ...page,
        items: page.items.map((row): Order => ({
          ...row,
          images: row.images.slice(0, 4),
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        })),
      };
      scope.log.set({ orders: { resultCount: orders.items.length } });
      return ok(orders);
    },
  ),

  get: query(
    { action: "orders.get", failure: "Failed to get order" },
    async (scope, input: { readonly orderId: string }) => {
      scope.log.set({ order: { id: input.orderId } });
      const [found] = await scope.tx
        .select({
          orderId: order.id,
          title: order.title,
          shop: order.shop,
          orderDate: order.orderDate,
          releaseDate: order.releaseDate,
          paymentDate: order.paymentDate,
          shippingDate: order.shippingDate,
          collectionDate: order.collectionDate,
          shippingMethod: order.shippingMethod,
          status: order.status,
          total: orderTotal,
          shippingFee: order.shippingFee,
          taxes: order.taxes,
          duties: order.duties,
          tariffs: order.tariffs,
          miscFees: order.miscFees,
          notes: order.notes,
          images: orderPreviewImagesSql,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt,
          itemCount,
        })
        .from(order)
        .leftJoin(collection, eq(order.id, collection.orderId))
        .where(and(eq(order.userId, scope.viewer.userId), eq(order.id, input.orderId)))
        .groupBy(order.id);
      if (!found) return fail("not_found", "Order not found");

      const result: Order = {
        ...found,
        images: found.images.slice(0, 4),
        createdAt: found.createdAt.toISOString(),
        updatedAt: found.updatedAt.toISOString(),
      };
      return ok(result);
    },
  ),

  items: query(
    { action: "orders.items", failure: "Failed to get order items" },
    async (scope, input: OrderItemsQuery & { readonly orderId: string }) => {
      scope.log.set({ order: { id: input.orderId } });
      const select = {
        id: collection.id,
        orderId: collection.orderId,
        itemId: item.id,
        itemExternalId: item.externalId,
        releaseId: collection.releaseId,
        status: collection.status,
        itemTitle: item.title,
        itemImage: item.image,
        itemCategory: item.category,
        price: collection.price,
        count: collection.count,
        shop: collection.shop,
        score: sql<string>`${collection.score}::text`,
        orderDate: collection.orderDate,
        paymentDate: collection.paymentDate,
        shippingDate: collection.shippingDate,
        collectionDate: collection.collectionDate,
        shippingMethod: collection.shippingMethod,
        releaseDate: item_release.date,
        releaseType: item_release.type,
        releasePrice: item_release.price,
        releaseCurrency: item_release.priceCurrency,
        releaseBarcode: item_release.barcode,
        condition: collection.condition,
        tags: collection.tags,
        notes: collection.notes,
      };
      const rows = (fields: typeof select) =>
        scope.tx
          .select(fields)
          .from(collection)
          .innerJoin(item, eq(collection.itemId, item.id))
          .leftJoin(item_release, eq(collection.releaseId, item_release.id))
          .where(
            and(eq(collection.userId, scope.viewer.userId), eq(collection.orderId, input.orderId)),
          )
          .$dynamic();

      const items = await paginate(scope, input, {
        select,
        rows,
        sortBy: {
          title: item.title,
          orderDate: collection.orderDate,
          releaseDate: item_release.date,
          count: collection.count,
          price: collection.price,
          status: collection.status,
          createdAt: collection.createdAt,
        },
        tiebreak: [collection.createdAt, collection.id],
      });
      scope.log.set({ orders: { itemCount: items.items.length } });
      return ok(items);
    },
  ),

  itemReleases: query(
    { action: "orders.item_releases", failure: "Failed to get order item releases" },
    async (scope, input: { readonly orderId: string }) => {
      scope.log.set({ order: { id: input.orderId } });
      const releases = await scope.tx
        .select({
          releaseDate: item_release.date,
          itemImage: item.image,
        })
        .from(collection)
        .innerJoin(item, eq(collection.itemId, item.id))
        .innerJoin(item_release, eq(collection.releaseId, item_release.id))
        .where(
          and(eq(collection.userId, scope.viewer.userId), eq(collection.orderId, input.orderId)),
        )
        .orderBy(asc(item_release.date), asc(item.title), asc(collection.id));
      scope.log.set({ orders: { releaseCount: releases.length } });
      return ok(releases);
    },
  ),

  merge: command(
    { action: "orders.merge", failure: "Failed to merge orders" },
    async (
      scope,
      input: {
        readonly orderIds: string[];
        readonly newOrder: NewOrder;
        readonly cascadeOptions: CascadeOptions;
      },
    ) => {
      const userId = scope.viewer.userId;
      scope.log.set({ merge: { orderCount: input.orderIds.length } });
      const [inserted] = await scope.tx
        .insert(order)
        .values({ userId, ...input.newOrder })
        .returning();
      if (!inserted) throw new Error("FAILED_TO_INSERT_NEW_ORDER");

      const cascadeProperties =
        input.cascadeOptions.length > 0
          ? Object.fromEntries(
              input.cascadeOptions.map((option) => [
                option,
                input.newOrder[option as keyof typeof input.newOrder],
              ]),
            )
          : {};

      const moved = await scope.tx
        .update(collection)
        .set({ orderId: inserted.id, ...cascadeProperties })
        .where(and(eq(collection.userId, userId), inArray(collection.orderId, input.orderIds)))
        .returning({ id: collection.id });
      if (moved.length === 0) return fail("not_found", "Order items not found");

      await advanceOrderReleaseDatesForCollectionItems(
        scope.tx,
        moved.map(({ id }) => id),
      );

      const deleted = await scope.tx
        .delete(order)
        .where(and(eq(order.userId, userId), inArray(order.id, input.orderIds)))
        .returning({ id: order.id });
      if (!foundAll(input.orderIds, deleted.length)) {
        return fail("not_found", "One or more orders not found");
      }

      return ok("Orders merged successfully");
    },
  ),

  split: command(
    { action: "orders.split", failure: "Failed to split orders" },
    async (
      scope,
      input: {
        readonly collectionIds: string[];
        readonly newOrder: NewOrder;
        readonly cascadeOptions: CascadeOptions;
      },
    ) => {
      const userId = scope.viewer.userId;
      scope.log.set({ split: { itemCount: input.collectionIds.length } });
      const [inserted] = await scope.tx
        .insert(order)
        .values({ userId, ...input.newOrder })
        .returning();
      if (!inserted) throw new Error("FAILED_TO_INSERT_NEW_ORDER");

      const cascadeProperties =
        input.cascadeOptions.length > 0
          ? Object.fromEntries(
              input.cascadeOptions.map((option) => [
                option,
                input.newOrder[option as keyof typeof input.newOrder],
              ]),
            )
          : {};

      const moved = await scope.tx
        .update(collection)
        .set({ orderId: inserted.id, ...cascadeProperties })
        .where(and(eq(collection.userId, userId), inArray(collection.id, input.collectionIds)))
        .returning({ id: collection.id });
      if (!foundAll(input.collectionIds, moved.length)) {
        return fail("not_found", "Order items not found");
      }

      await advanceOrderReleaseDatesForCollectionItems(
        scope.tx,
        moved.map(({ id }) => id),
      );

      return ok("Items split successfully");
    },
  ),

  moveItems: command(
    { action: "orders.move_items", failure: "Failed to move items" },
    async (
      scope,
      input: {
        readonly targetOrderId: string;
        readonly collectionIds: string[];
        readonly orderIds?: string[];
      },
    ) => {
      const userId = scope.viewer.userId;
      scope.log.set({
        move: {
          itemCount: input.collectionIds.length,
          sourceOrderCount: input.orderIds?.length ?? 0,
        },
      });
      const [target] = await scope.tx
        .select({ id: order.id })
        .from(order)
        .where(and(eq(order.id, input.targetOrderId), eq(order.userId, userId)))
        .limit(1);
      if (!target) return fail("not_found", "Order not found");

      const moved = await scope.tx
        .update(collection)
        .set({ orderId: input.targetOrderId })
        .where(
          and(
            eq(collection.userId, userId),
            inArray(collection.id, input.collectionIds),
            input.orderIds && input.orderIds.length > 0
              ? or(inArray(collection.orderId, input.orderIds), isNull(collection.orderId))
              : undefined,
          ),
        )
        .returning({ id: collection.id });
      if (!foundAll(input.collectionIds, moved.length)) {
        return fail("not_found", "Order items not found");
      }

      await advanceOrderReleaseDatesForCollectionItems(
        scope.tx,
        moved.map(({ id }) => id),
      );
      return ok("Items moved successfully");
    },
  ),

  update: command(
    { action: "orders.update", failure: "Failed to update order" },
    async (
      scope,
      input: {
        readonly orderId: string;
        readonly order: OrderUpdateType;
        readonly cascadeOptions: CascadeOptions;
      },
    ) => {
      const userId = scope.viewer.userId;
      scope.log.set({ order: { id: input.orderId } });
      const updated = await scope.tx
        .update(order)
        .set({ ...input.order, updatedAt: new Date() })
        .where(and(eq(order.userId, userId), eq(order.id, input.orderId)))
        .returning({ id: order.id });
      if (updated.length === 0) return fail("not_found", "Order not found");

      if (input.cascadeOptions.length > 0) {
        const cascadeProperties = Object.fromEntries(
          input.cascadeOptions.map((option) => [
            option,
            input.order[option as keyof typeof input.order],
          ]),
        );

        await scope.tx
          .update(collection)
          .set({ ...cascadeProperties })
          .where(and(eq(collection.userId, userId), eq(collection.orderId, input.orderId)));
      }
      return ok("Order updated successfully");
    },
  ),

  remove: command(
    { action: "orders.delete_many", failure: "Failed to delete orders" },
    async (scope, input: { readonly orderIds: string[] }) => {
      const userId = scope.viewer.userId;
      scope.log.set({ delete: { orderCount: input.orderIds.length } });
      await scope.tx
        .delete(collection)
        .where(
          and(
            eq(collection.userId, userId),
            inArray(collection.orderId, input.orderIds),
            ne(collection.status, "Owned"),
          ),
        );
      const deleted = await scope.tx
        .delete(order)
        .where(and(eq(order.userId, userId), inArray(order.id, input.orderIds)))
        .returning({ id: order.id });
      if (!foundAll(input.orderIds, deleted.length)) {
        return fail("not_found", "One or more orders not found");
      }

      return ok("Orders deleted successfully");
    },
  ),

  removeItems: command(
    { action: "orders.delete_items", failure: "Failed to delete order items" },
    async (scope, input: { readonly collectionIds: string[] }) => {
      scope.log.set({ delete: { itemCount: input.collectionIds.length } });
      const removed = await removeItems(scope.tx, scope.viewer.userId, input.collectionIds);
      if (!foundAll(input.collectionIds, removed)) {
        return fail("not_found", "One or more order items not found");
      }

      return ok("Order items deleted successfully");
    },
  ),

  removeItem: command(
    { action: "orders.delete_item", failure: "Failed to delete order item" },
    async (scope, input: { readonly orderId: string; readonly collectionId: string }) => {
      scope.log.set({ order: { id: input.orderId }, item: { collectionId: input.collectionId } });
      const removed = await removeItems(
        scope.tx,
        scope.viewer.userId,
        [input.collectionId],
        input.orderId,
      );
      if (removed === 0) return fail("not_found", "Order item not found");

      return ok("Order item deleted successfully");
    },
  ),
};
