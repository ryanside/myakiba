import { db } from "@/db";
import { order, collection, item } from "@/db/schema/figure";
import { eq, and, inArray, sql, desc, asc, ilike } from "drizzle-orm";
import type { orderInsertType, orderUpdateType } from "./model";

class OrdersService {
  async getOrders(
    userId: string,
    limit: number,
    offset: number,
    sortBy: string,
    orderBy: string,
    search?: string
  ) {
    const whereConditions = and(
      eq(order.userId, userId),
      search ? ilike(order.title, `%${search}%`) : undefined
    );

    const sortByColumn = (() => {
      switch (sortBy) {
        case "title":
          return order.title;
        case "shop":
          return order.shop;
        case "orderDate":
          return order.orderDate;
        case "releaseMonthYear":
          return order.releaseMonthYear;
        case "shippingMethod":
          return order.shippingMethod;
        case "total":
          return sql<string>`SUM(${collection.price}::numeric) + COALESCE(${order.taxes}::numeric, 0) + COALESCE(${order.duties}::numeric, 0) + COALESCE(${order.tariffs}::numeric, 0) + COALESCE(${order.miscFees}::numeric, 0)`;
        case "itemCount":
          return sql<number>`COUNT(${collection.id})`;
        case "createdAt":
          return order.createdAt;
        default:
          return order.createdAt;
      }
    })();

    const orders = await db
      .select({
        orderId: order.id,
        title: order.title,
        shop: order.shop,
        releaseMonthYear: order.releaseMonthYear,
        shippingMethod: order.shippingMethod,
        orderDate: order.orderDate,
        paymentDate: order.paymentDate,
        shippingDate: order.shippingDate,
        orderStatus: order.orderStatus,
        total: sql<string>`SUM(${collection.price}::numeric) + COALESCE(${order.shippingFee}::numeric, 0) + COALESCE(${order.taxes}::numeric, 0) + COALESCE(${order.duties}::numeric, 0) + COALESCE(${order.tariffs}::numeric, 0) + COALESCE(${order.miscFees}::numeric, 0)`,
        itemCount: sql<number>`COUNT(${collection.id})`,
        itemImages: sql<
        string[]
        >`array_agg(DISTINCT ${item.image}) FILTER (WHERE ${item.image} IS NOT NULL)`,
        itemTitles: sql<string[]>`array_agg(DISTINCT ${item.title})`,
        itemIds: sql<number[]>`array_agg(DISTINCT ${item.id})`,
        itemPrices: sql<string[]>`array_agg(DISTINCT ${collection.price}::text)`,
        // Use window function to get total count without additional query
        totalCount: sql<number>`COUNT(*) OVER()`,
      })
      .from(order)
      .leftJoin(
        collection,
        and(eq(order.id, collection.orderId), eq(collection.status, "Ordered"))
      )
      .leftJoin(item, eq(collection.itemId, item.id))
      .where(whereConditions)
      .groupBy(
        order.id,
        order.title,
        order.shop,
        order.releaseMonthYear,
        order.shippingMethod,
        order.orderDate,
        order.paymentDate,
        order.shippingDate,
        order.orderStatus,
        order.shippingFee,
        order.taxes,
        order.duties,
        order.tariffs,
        order.miscFees
      )
      .orderBy(orderBy === "asc" ? asc(sortByColumn) : desc(sortByColumn))
      .limit(limit)
      .offset(offset);


    return { orders };
  }

  async getOrder(userId: string, orderId: string) {
    const orderInfo = await db
      .select({
        title: order.title,
        shop: order.shop,
        orderDate: order.orderDate,
        releaseMonthYear: order.releaseMonthYear,
        paymentDate: order.paymentDate,
        shippingDate: order.shippingDate,
        collectionDate: order.collectionDate,
        shippingMethod: order.shippingMethod,
        orderStatus: order.orderStatus,
        total: order.total,
        shippingFee: order.shippingFee,
        taxes: order.taxes,
        duties: order.duties,
        tariffs: order.tariffs,
        miscFees: order.miscFees,
        notes: order.notes,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        itemCount: sql<number>`COUNT(${collection.id})`,
        itemImages: sql<
          string[]
        >`array_agg(DISTINCT ${item.image}) FILTER (WHERE ${item.image} IS NOT NULL)`,
        itemTitles: sql<string[]>`array_agg(DISTINCT ${item.title})`,
        itemIds: sql<number[]>`array_agg(DISTINCT ${item.id})`,
        itemPrices: sql<string[]>`array_agg(DISTINCT ${collection.price}::text)`,
      })
      .from(order)
      .leftJoin(collection, eq(order.id, collection.orderId))
      .leftJoin(item, eq(collection.itemId, item.id))
      .where(and(eq(order.userId, userId), eq(order.id, orderId)));

    if (!orderInfo || orderInfo.length === 0) {
      throw new Error("ORDER_NOT_FOUND");
    }

    return orderInfo;
  }

  async mergeOrders(
    userId: string,
    orderIds: string[],
    newOrder: orderInsertType
  ) {
    const merged = await db.transaction(async (tx) => {
      const newOrderInserted = await tx.insert(order).values({
        ...newOrder,
      });
      if (!newOrderInserted || newOrderInserted.length === 0) {
        throw new Error("FAILED_TO_INSERT_NEW_ORDER");
      }

      const collectionUpdated = await tx
        .update(collection)
        .set({
          orderId: newOrder.id,
        })
        .where(
          and(
            eq(collection.userId, userId),
            inArray(collection.orderId, orderIds)
          )
        );
      if (!collectionUpdated || collectionUpdated.length === 0) {
        throw new Error("ORDER_ITEMS_NOT_FOUND");
      }

      const deletedOrders = await tx
        .delete(order)
        .where(and(eq(order.userId, userId), inArray(order.id, orderIds)));
      if (!deletedOrders || deletedOrders.length === 0) {
        throw new Error("ORDERS_NOT_FOUND");
      }

      return { newOrderInserted, collectionUpdated, deletedOrders };
    });

    return { merged };
  }

  async splitOrders(
    userId: string,
    orderId: string,
    newOrder: orderInsertType
  ) {
    const splitted = await db.transaction(async (tx) => {
      const newOrderInserted = await tx.insert(order).values({
        ...newOrder,
      });
      if (!newOrderInserted || newOrderInserted.length === 0) {
        throw new Error("FAILED_TO_INSERT_NEW_ORDER");
      }

      const collectionUpdated = await tx
        .update(collection)
        .set({
          orderId: newOrder.id,
        })
        .where(
          and(eq(collection.userId, userId), eq(collection.orderId, orderId))
        );
      if (!collectionUpdated || collectionUpdated.length === 0) {
        throw new Error("ORDER_ITEMS_NOT_FOUND");
      }

      return { newOrderInserted, collectionUpdated };
    });

    return { splitted };
  }

  async updateOrder(
    userId: string,
    orderId: string,
    updatedOrder: orderUpdateType
  ) {
    const updated = await db.transaction(async (tx) => {
      const orderUpdated = await tx
        .update(order)
        .set(updatedOrder)
        .where(and(eq(order.userId, userId), eq(order.id, orderId)));
      if (!orderUpdated || orderUpdated.length === 0) {
        throw new Error("ORDER_NOT_FOUND");
      }

      const collectionUpdated = await tx
        .update(collection)
        .set({
          shop: updatedOrder.shop,
          orderDate: updatedOrder.orderDate,
          paymentDate: updatedOrder.paymentDate,
          shippingDate: updatedOrder.shippingDate,
          collectionDate: updatedOrder.collectionDate,
          shippingMethod: updatedOrder.shippingMethod,
        })
        .where(
          and(eq(collection.userId, userId), eq(collection.orderId, orderId))
        );
      if (!collectionUpdated || collectionUpdated.length === 0) {
        throw new Error("ORDER_ITEMS_NOT_FOUND");
      }

      if (updatedOrder.orderStatus === "Collected") {
        const collectionUpdatedStatus = await tx
          .update(collection)
          .set({ status: "Owned" })
          .where(
            and(
              eq(collection.userId, userId),
              eq(collection.orderId, orderId),
              eq(collection.status, "Ordered")
            )
          );
        if (!collectionUpdatedStatus || collectionUpdatedStatus.length === 0) {
          throw new Error("ORDER_ITEMS_NOT_FOUND");
        }

        return { orderUpdated, collectionUpdated, collectionUpdatedStatus };
      }

      return { orderUpdated, collectionUpdated };
    });

    return updated;
  }

  async deleteItemsFromOrder(
    userId: string,
    orderId: string,
    itemIds: number[]
  ) {
    const deleted = await db
      .delete(collection)
      .where(
        and(
          eq(collection.userId, userId),
          eq(collection.orderId, orderId),
          inArray(collection.itemId, itemIds)
        )
      );

    if (!deleted || deleted.length === 0) {
      throw new Error("ORDER_ITEMS_NOT_FOUND");
    }

    return deleted[0];
  }

  async deleteOrders(userId: string, orderIds: string[]) {
    const deleted = await db.transaction(async (tx) => {
      // Only cascade delete collection items with "Ordered" status
      const deletedCollectionItems = await tx
        .delete(collection)
        .where(
          and(
            eq(collection.userId, userId),
            inArray(collection.orderId, orderIds),
            eq(collection.status, "Ordered")
          )
        );

      if (!deletedCollectionItems || deletedCollectionItems.length === 0) {
        throw new Error("ORDERS_ITEMS_NOT_FOUND");
      }

      const deletedOrders = await tx
        .delete(order)
        .where(and(eq(order.userId, userId), inArray(order.id, orderIds)));

      if (!deletedOrders || deletedOrders.length === 0) {
        throw new Error("ORDERS_NOT_FOUND");
      }

      return { deletedCollectionItems, deletedOrders };
    });

    return deleted;
  }
}

export default new OrdersService();
