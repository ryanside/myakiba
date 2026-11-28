import { and, asc, eq, gte, ilike, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { advanceOrderReleaseDatesForCollectionItems } from "@myakiba/db/order-release-date";
import { collection, item, item_release, order } from "@myakiba/db/schema/figure";
import type { Tx } from "@myakiba/db/tx";
import type {
  CascadeOptions,
  NewOrder,
  OrderEdit,
  OrderItemsQuery,
} from "@myakiba/contracts/orders/schema";
import type { FillOrdersBody } from "@myakiba/contracts/orders/fill";
import type { Order } from "@myakiba/contracts/orders/types";
import { fillColumns } from "@/lib/fill-columns";
import type { CascadeColumns } from "@/lib/fill-columns";
import { foundAll } from "@/lib/found-all";
import { shopSpellings } from "@/lib/shop-spelling";
import { orderPreviewImagesSql } from "@/lib/order-preview";
import { Result, panic } from "better-result";
import { command, paginate, query } from "@/domain/kernel";
import { OrderItemNotFound } from "./errors/order-item-not-found";
import { OrderItemsNotFound } from "./errors/order-items-not-found";
import { OrderNotFound } from "./errors/order-not-found";
import { SomeOrderItemsNotFound } from "./errors/some-order-items-not-found";
import { SomeOrdersNotFound } from "./errors/some-orders-not-found";
import type { OrdersQuery } from "./model";
import { itemImageSql } from "@/lib/item-image-url";
import { orderDraft } from "./order-draft";
import {
  itemIsPaid,
  itemOrderJoin,
  orderPaidItemCount,
  orderSpend,
  orderTotal,
  orderUnpaidCosts,
} from "@/lib/order-money";

const itemCount = sql<number>`COUNT(${collection.id})`.mapWith(Number);
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
    filters.paid === undefined ? undefined : eq(order.paid, filters.paid),
    filters.shippingFeeMin === undefined
      ? undefined
      : gte(order.shippingFee, filters.shippingFeeMin),
    filters.shippingFeeMax === undefined
      ? undefined
      : lte(order.shippingFee, filters.shippingFeeMax),
  );
}

async function cascadeToItems(
  tx: Tx,
  userId: string,
  orderIds: readonly string[],
  columns: CascadeColumns,
): Promise<void> {
  await tx
    .update(collection)
    .set(columns)
    .where(and(eq(collection.userId, userId), inArray(collection.orderId, orderIds)));
}

async function spelledOrder(
  tx: Tx,
  userId: string,
  newOrder: NewOrder,
  deletedOrders?: SQL,
): Promise<NewOrder> {
  const spell = await shopSpellings(tx, userId, [newOrder.shop], { orders: deletedOrders });
  return { ...newOrder, shop: spell(newOrder.shop) };
}

async function spelledEdit(
  tx: Tx,
  userId: string,
  input: {
    readonly orderId: string;
    readonly order: OrderEdit;
    readonly cascadeOptions: CascadeOptions;
  },
  oldShop: string,
): Promise<OrderEdit> {
  const { shop } = input.order;
  if (shop === undefined || shop === oldShop.trim()) return input.order;
  const spell = await shopSpellings(tx, userId, [shop], {
    orders: eq(order.id, input.orderId),
    collectionItems: input.cascadeOptions.includes("shop")
      ? and(eq(collection.orderId, input.orderId), eq(collection.shop, oldShop))
      : undefined,
  });
  return { ...input.order, shop: spell(shop) };
}

/**
 * Locks Orders about to be deleted, in id order. Deleting an Order sets its items' order_id to
 * null, so an item that joined it after its items were read would stay Ordered or Shipped outside
 * any Order.
 */
async function lockOrdersToDelete(tx: Tx, userId: string, orderIds: readonly string[]) {
  await tx
    .select({ id: order.id })
    .from(order)
    .where(and(eq(order.userId, userId), inArray(order.id, orderIds)))
    .orderBy(asc(order.id))
    .for("update");
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
        paid: order.paid,
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
            order.paid,
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
              input.paidItemsMin === undefined
                ? undefined
                : sql`${orderPaidItemCount} >= ${input.paidItemsMin}`,
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
          paid: order.paid,
          itemCount,
          createdAt: order.createdAt,
        },
        tiebreak: [order.createdAt, order.id],
        totals: {
          totalSpent: { sum: orderSpend },
          activeOrders: { count: ne(order.status, "Owned") },
          unpaidCosts: { sum: orderUnpaidCosts },
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
      return Result.ok(orders);
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
          paid: order.paid,
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
      if (!found) return Result.err(new OrderNotFound());

      const result: Order = {
        ...found,
        images: found.images.slice(0, 4),
        createdAt: found.createdAt.toISOString(),
        updatedAt: found.updatedAt.toISOString(),
      };
      return Result.ok(result);
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
        itemImage: itemImageSql().as("item_image"),
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
      return Result.ok(items);
    },
  ),

  itemReleases: query(
    { action: "orders.item_releases", failure: "Failed to get order item releases" },
    async (scope, input: { readonly orderId: string }) => {
      scope.log.set({ order: { id: input.orderId } });
      const releases = await scope.tx
        .select({
          releaseDate: item_release.date,
          itemImage: itemImageSql().as("item_image"),
        })
        .from(collection)
        .innerJoin(item, eq(collection.itemId, item.id))
        .innerJoin(item_release, eq(collection.releaseId, item_release.id))
        .where(
          and(eq(collection.userId, scope.viewer.userId), eq(collection.orderId, input.orderId)),
        )
        .orderBy(asc(item_release.date), asc(item.title), asc(collection.id));
      scope.log.set({ orders: { releaseCount: releases.length } });
      return Result.ok(releases);
    },
  ),

  mergeDraft: query(
    { action: "orders.merge_draft", failure: "Couldn't load the orders to merge." },
    async (scope, input: { readonly orderIds: string[] }) => {
      scope.log.set({ draft: { orderCount: input.orderIds.length } });
      const sources = await scope.tx
        .select({
          shop: order.shop,
          status: order.status,
          paid: order.paid,
          orderDate: order.orderDate,
          releaseDate: order.releaseDate,
          paymentDate: order.paymentDate,
          shippingDate: order.shippingDate,
          collectionDate: order.collectionDate,
          shippingMethod: order.shippingMethod,
          shippingFee: order.shippingFee,
          taxes: order.taxes,
          duties: order.duties,
          tariffs: order.tariffs,
          miscFees: order.miscFees,
          notes: order.notes,
        })
        .from(order)
        .where(and(eq(order.userId, scope.viewer.userId), inArray(order.id, input.orderIds)))
        .orderBy(asc(order.createdAt), asc(order.id));
      if (!foundAll(input.orderIds, sources.length)) return Result.err(new SomeOrdersNotFound());
      return Result.ok(orderDraft(sources));
    },
  ),

  newOrderDraft: query(
    { action: "orders.new_order_draft", failure: "Couldn't load the selected items." },
    async (scope, input: { readonly collectionIds: string[] }) => {
      scope.log.set({ draft: { itemCount: input.collectionIds.length } });
      const items = await scope.tx
        .select({
          shop: collection.shop,
          status: collection.status,
          paid: sql<boolean>`${itemIsPaid}`,
          orderDate: collection.orderDate,
          releaseDate: item_release.date,
          paymentDate: collection.paymentDate,
          shippingDate: collection.shippingDate,
          collectionDate: collection.collectionDate,
          shippingMethod: collection.shippingMethod,
        })
        .from(collection)
        .leftJoin(...itemOrderJoin)
        .leftJoin(item_release, eq(collection.releaseId, item_release.id))
        .where(
          and(
            eq(collection.userId, scope.viewer.userId),
            inArray(collection.id, input.collectionIds),
          ),
        );
      if (!foundAll(input.collectionIds, items.length)) return Result.err(new OrderItemsNotFound());
      const noFees = { shippingFee: 0, taxes: 0, duties: 0, tariffs: 0, miscFees: 0, notes: "" };
      return Result.ok(orderDraft(items.map((source) => ({ ...source, ...noFees }))));
    },
  ),

  merge: command(
    { action: "orders.merge", failure: "Failed to merge orders" },
    async (
      scope,
      input: {
        readonly orderIds: string[];
        readonly newOrder: NewOrder;
      },
    ) => {
      const userId = scope.viewer.userId;
      scope.log.set({ merge: { orderCount: input.orderIds.length } });
      await lockOrdersToDelete(scope.tx, userId, input.orderIds);
      const merged = await spelledOrder(
        scope.tx,
        userId,
        input.newOrder,
        inArray(order.id, input.orderIds),
      );
      const [inserted] = await scope.tx
        .insert(order)
        .values({ userId, ...merged })
        .returning();
      if (!inserted)
        panic(
          "Inserting the merged order returned no row, so orders.merge has no order to move items into",
        );

      const moved = await scope.tx
        .update(collection)
        .set({ orderId: inserted.id })
        .where(and(eq(collection.userId, userId), inArray(collection.orderId, input.orderIds)))
        .returning({ id: collection.id });
      if (moved.length === 0) return Result.err(new OrderItemsNotFound());

      await advanceOrderReleaseDatesForCollectionItems(
        scope.tx,
        moved.map(({ id }) => id),
      );

      const deleted = await scope.tx
        .delete(order)
        .where(and(eq(order.userId, userId), inArray(order.id, input.orderIds)))
        .returning({ id: order.id });
      if (!foundAll(input.orderIds, deleted.length)) {
        return Result.err(new SomeOrdersNotFound());
      }

      return Result.ok("Orders merged successfully" as const);
    },
  ),

  split: command(
    { action: "orders.split", failure: "Failed to split orders" },
    async (
      scope,
      input: {
        readonly collectionIds: string[];
        readonly newOrder: NewOrder;
      },
    ) => {
      const userId = scope.viewer.userId;
      scope.log.set({ split: { itemCount: input.collectionIds.length } });
      const [inserted] = await scope.tx
        .insert(order)
        .values({ userId, ...(await spelledOrder(scope.tx, userId, input.newOrder)) })
        .returning();
      if (!inserted)
        panic(
          "Inserting the split order returned no row, so orders.split has no order to move items into",
        );

      const moved = await scope.tx
        .update(collection)
        .set({ orderId: inserted.id })
        .where(and(eq(collection.userId, userId), inArray(collection.id, input.collectionIds)))
        .returning({ id: collection.id });
      if (!foundAll(input.collectionIds, moved.length)) {
        return Result.err(new OrderItemsNotFound());
      }

      await advanceOrderReleaseDatesForCollectionItems(
        scope.tx,
        moved.map(({ id }) => id),
      );

      return Result.ok("Items split successfully" as const);
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
      if (!target) return Result.err(new OrderNotFound());

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
        return Result.err(new OrderItemsNotFound());
      }

      await advanceOrderReleaseDatesForCollectionItems(
        scope.tx,
        moved.map(({ id }) => id),
      );
      return Result.ok("Items moved successfully" as const);
    },
  ),

  /**
   * Updates the Order, then copies each listed field the edit changed to the items that still
   * held the Order's old value, so a value set on one item stays. It locks the Order, then its
   * items in id order, as Orders.fill does.
   */
  update: command(
    { action: "orders.update", failure: "Failed to update order" },
    async (
      scope,
      input: {
        readonly orderId: string;
        readonly order: OrderEdit;
        readonly cascadeOptions: CascadeOptions;
      },
    ) => {
      const userId = scope.viewer.userId;
      scope.log.set({ order: { id: input.orderId } });
      const selected = and(eq(order.userId, userId), eq(order.id, input.orderId));
      const [before] = await scope.tx.select().from(order).where(selected).for("no key update");
      if (!before) return Result.err(new OrderNotFound());
      const edit = await spelledEdit(scope.tx, userId, input, before.shop);

      await scope.tx
        .update(order)
        .set({ ...edit, updatedAt: new Date() })
        .where(selected);

      const changed = [...new Set(input.cascadeOptions)].filter(
        (field) => edit[field] !== undefined && edit[field] !== before[field],
      );
      if (changed.length === 0) return Result.ok("Order updated successfully" as const);

      const items = and(eq(collection.userId, userId), eq(collection.orderId, input.orderId));
      await scope.tx
        .select({ id: collection.id })
        .from(collection)
        .where(items)
        .orderBy(asc(collection.id))
        .for("no key update");
      for (const field of changed) {
        const old = before[field];
        await scope.tx
          .update(collection)
          .set(Object.fromEntries([[field, edit[field]]]))
          .where(and(items, old === null ? isNull(collection[field]) : eq(collection[field], old)));
      }
      return Result.ok("Order updated successfully" as const);
    },
  ),

  /**
   * Writes one field to every listed Order and, for every field but Paid, cascades it to their
   * items, or writes nothing.
   * It locks the Orders, then their items, each in id order, the order Collection.fill locks
   * items in, so overlapping fills wait instead of deadlocking.
   */
  fill: command(
    { action: "orders.fill", failure: "Failed to fill orders" },
    async (scope, input: FillOrdersBody) => {
      const userId = scope.viewer.userId;
      scope.log.set({ orders: { fill: input.fill.field, orderCount: input.orderIds.length } });
      const selected = and(eq(order.userId, userId), inArray(order.id, input.orderIds));
      const lockedOrders = await scope.tx
        .select({ id: order.id })
        .from(order)
        .where(selected)
        .orderBy(asc(order.id))
        .for("no key update");
      if (!foundAll(input.orderIds, lockedOrders.length)) {
        return Result.err(new SomeOrdersNotFound());
      }
      if (input.fill.field === "paid") {
        await scope.tx
          .update(order)
          .set({ paid: input.fill.value, updatedAt: new Date() })
          .where(selected);
        return Result.ok("Orders filled successfully" as const);
      }
      await scope.tx
        .select({ id: collection.id })
        .from(collection)
        .where(and(eq(collection.userId, userId), inArray(collection.orderId, input.orderIds)))
        .orderBy(asc(collection.id))
        .for("no key update");

      const filled = fillColumns(input.fill);
      const columns: typeof filled =
        filled.shop === undefined
          ? filled
          : {
              shop: (
                await shopSpellings(scope.tx, userId, [filled.shop], {
                  orders: selected,
                  collectionItems: inArray(collection.orderId, input.orderIds),
                })
              )(filled.shop),
            };
      await scope.tx
        .update(order)
        .set({ ...columns, updatedAt: new Date() })
        .where(selected);
      await cascadeToItems(scope.tx, userId, input.orderIds, columns);
      return Result.ok("Orders filled successfully" as const);
    },
  ),

  /**
   * Deletes the Orders and their not-Owned items, and detaches the Owned ones. It locks the
   * Orders, then their items, each in id order, so no item turns Ordered or Shipped between the
   * delete of the not-Owned items and the detach.
   */
  remove: command(
    { action: "orders.delete_many", failure: "Failed to delete orders" },
    async (scope, input: { readonly orderIds: string[] }) => {
      const userId = scope.viewer.userId;
      scope.log.set({ delete: { orderCount: input.orderIds.length } });
      await lockOrdersToDelete(scope.tx, userId, input.orderIds);
      const items = and(eq(collection.userId, userId), inArray(collection.orderId, input.orderIds));
      await scope.tx
        .select({ id: collection.id })
        .from(collection)
        .where(items)
        .orderBy(asc(collection.id))
        .for("no key update");
      await scope.tx.delete(collection).where(and(items, ne(collection.status, "Owned")));
      const deleted = await scope.tx
        .delete(order)
        .where(and(eq(order.userId, userId), inArray(order.id, input.orderIds)))
        .returning({ id: order.id });
      if (!foundAll(input.orderIds, deleted.length)) {
        return Result.err(new SomeOrdersNotFound());
      }

      return Result.ok("Orders deleted successfully" as const);
    },
  ),

  removeItems: command(
    { action: "orders.delete_items", failure: "Failed to delete order items" },
    async (scope, input: { readonly collectionIds: string[] }) => {
      scope.log.set({ delete: { itemCount: input.collectionIds.length } });
      const removed = await removeItems(scope.tx, scope.viewer.userId, input.collectionIds);
      if (!foundAll(input.collectionIds, removed)) {
        return Result.err(new SomeOrderItemsNotFound());
      }

      return Result.ok("Order items deleted successfully" as const);
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
      if (removed === 0) return Result.err(new OrderItemNotFound());

      return Result.ok("Order item deleted successfully" as const);
    },
  ),
};
