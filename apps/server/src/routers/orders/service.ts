import { db } from "@/db";
import { order, collection, item, item_release } from "@/db/schema/figure";
import { eq, and, inArray, sql, desc, asc, ilike } from "drizzle-orm";
import type { orderInsertType, orderUpdateType } from "./model";

type OrderItem = {
  collectionId: string;
  itemId: number;
  title: string;
  image: string | null;
  price: string;
  count: number;
  shop: string | null;
  orderDate: string | null;
  paymentDate: string | null;
  shippingDate: string | null;
  collectionDate: string | null;
  shippingMethod: string | null;
  releaseDate: string | null;
  condition: string | null;
};

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
          return sql<string>`COALESCE(SUM(${collection.price}::numeric), 0) + COALESCE(${order.shippingFee}::numeric, 0) + COALESCE(${order.taxes}::numeric, 0) + COALESCE(${order.duties}::numeric, 0) + COALESCE(${order.tariffs}::numeric, 0) + COALESCE(${order.miscFees}::numeric, 0)`;
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
        collectionDate: order.collectionDate,
        orderStatus: order.orderStatus,
        total: sql<string>`COALESCE(SUM(${collection.price}::numeric), 0) + COALESCE(${order.shippingFee}::numeric, 0) + COALESCE(${order.taxes}::numeric, 0) + COALESCE(${order.duties}::numeric, 0) + COALESCE(${order.tariffs}::numeric, 0) + COALESCE(${order.miscFees}::numeric, 0)`,
        shippingFee: order.shippingFee,
        taxes: order.taxes,
        duties: order.duties,
        tariffs: order.tariffs,
        miscFees: order.miscFees,
        notes: order.notes,
        itemCount: sql<number>`COUNT(${collection.id})`,
        createdAt: order.createdAt,
        items: sql<OrderItem[]>`
          COALESCE(
            JSON_AGG(
              JSON_BUILD_OBJECT(
                'collectionId', ${collection.id},
                'itemId', ${item.id},
                'title', ${item.title},
                'image', ${item.image},
                'price', ${collection.price}::text,
                'count', ${collection.count},
                'shop', ${collection.shop},
                'orderDate', ${collection.orderDate},
                'paymentDate', ${collection.paymentDate},
                'shippingDate', ${collection.shippingDate},
                'collectionDate', ${collection.collectionDate},
                'shippingMethod', ${collection.shippingMethod},
                'releaseDate', ${item_release.date},
                'condition', ${collection.condition}
              )
              ORDER BY ${item.title}
            ) FILTER (WHERE ${collection.id} IS NOT NULL),
            '[]'::json
          )
        `,
        totalCount: sql<number>`COUNT(*) OVER()`,
      })
      .from(order)
      .leftJoin(
        collection,
        and(eq(order.id, collection.orderId), eq(collection.status, "Ordered"))
      )
      .leftJoin(item, eq(collection.itemId, item.id))
      .leftJoin(item_release, eq(collection.releaseId, item_release.id))
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
        order.collectionDate,
        order.orderStatus,
        order.shippingFee,
        order.taxes,
        order.duties,
        order.tariffs,
        order.miscFees,
        order.notes,
        order.createdAt
      )
      .orderBy(
        orderBy === "asc" ? asc(sortByColumn) : desc(sortByColumn),
        orderBy === "asc" ? asc(order.createdAt) : desc(order.createdAt)
      )
      .limit(limit)
      .offset(offset);

    return { orders };
  }

  async getOrder(userId: string, orderId: string) {
    const orderInfo = await db
      .select({
        orderId: order.id,
        title: order.title,
        shop: order.shop,
        orderDate: order.orderDate,
        releaseMonthYear: order.releaseMonthYear,
        paymentDate: order.paymentDate,
        shippingDate: order.shippingDate,
        collectionDate: order.collectionDate,
        shippingMethod: order.shippingMethod,
        orderStatus: order.orderStatus,
        total: sql<string>`COALESCE(SUM(${collection.price}::numeric), 0) + COALESCE(${order.shippingFee}::numeric, 0) + COALESCE(${order.taxes}::numeric, 0) + COALESCE(${order.duties}::numeric, 0) + COALESCE(${order.tariffs}::numeric, 0) + COALESCE(${order.miscFees}::numeric, 0)`,
        shippingFee: order.shippingFee,
        taxes: order.taxes,
        duties: order.duties,
        tariffs: order.tariffs,
        miscFees: order.miscFees,
        notes: order.notes,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        itemCount: sql<number>`COUNT(${collection.id})`,
        items: sql<OrderItem[]>`
          COALESCE(
            JSON_AGG(
              JSON_BUILD_OBJECT(
                'collectionId', ${collection.id},
                'itemId', ${item.id},
                'title', ${item.title},
                'image', ${item.image},
                'price', ${collection.price}::text,
                'count', ${collection.count},
                'shop', ${collection.shop},
                'orderDate', ${collection.orderDate},
                'paymentDate', ${collection.paymentDate},
                'shippingDate', ${collection.shippingDate},
                'collectionDate', ${collection.collectionDate},
                'shippingMethod', ${collection.shippingMethod},
                'releaseDate', ${item_release.date},
                'condition', ${collection.condition}
              )
              ORDER BY ${item.title}
            ) FILTER (WHERE ${collection.id} IS NOT NULL),
            '[]'::json
          )
        `,
        totalCount: sql<number>`COUNT(*) OVER()`,
      })
      .from(order)
      .leftJoin(collection, eq(order.id, collection.orderId))
      .leftJoin(item, eq(collection.itemId, item.id))
      .leftJoin(item_release, eq(collection.releaseId, item_release.id))
      .where(and(eq(order.userId, userId), eq(order.id, orderId)));

    if (!orderInfo || orderInfo.length === 0) {
      throw new Error("ORDER_NOT_FOUND");
    }

    return orderInfo;
  }

  async mergeOrders(
    userId: string,
    orderIds: string[],
    newOrder: Omit<orderInsertType, "userId">,
    cascadeOptions: string[]
  ) {
    const merged = await db.transaction(async (tx) => {
      const newOrderInserted = await tx
        .insert(order)
        .values({
          userId: userId,
          ...newOrder,
        })
        .returning();

      if (!newOrderInserted || newOrderInserted.length === 0) {
        throw new Error("FAILED_TO_INSERT_NEW_ORDER");
      }

      const cascadeProperties = cascadeOptions.length > 0 
        ? Object.fromEntries(
            cascadeOptions.map((option) => [
              option,
              newOrder[option as keyof typeof newOrder],
            ])
          )
        : {};

      const collectionUpdated = await tx
        .update(collection)
        .set({
          orderId: newOrderInserted[0].id,
          ...cascadeProperties,
        })
        .where(
          and(
            eq(collection.userId, userId),
            inArray(collection.orderId, orderIds)
          )
        )
        .returning({ id: collection.id });
      if (!collectionUpdated || collectionUpdated.length === 0) {
        throw new Error("ORDER_ITEMS_NOT_FOUND");
      }

      const deletedOrders = await tx
        .delete(order)
        .where(and(eq(order.userId, userId), inArray(order.id, orderIds)))
        .returning({ id: order.id });
      if (!deletedOrders || deletedOrders.length === 0) {
        throw new Error("ORDERS_NOT_FOUND");
      }

      return {};
    });

    return merged;
  }

  async splitOrders(
    userId: string,
    collectionIds: string[],
    newOrder: Omit<orderInsertType, "userId">,
    cascadeOptions: string[]
  ) {
    const splitted = await db.transaction(async (tx) => {
      const newOrderInserted = await tx
        .insert(order)
        .values({
          userId: userId,
          ...newOrder,
        })
        .returning();
      if (!newOrderInserted || newOrderInserted.length === 0) {
        throw new Error("FAILED_TO_INSERT_NEW_ORDER");
      }

      const cascadeProperties = cascadeOptions.length > 0 
        ? Object.fromEntries(
            cascadeOptions.map((option) => [
              option,
              newOrder[option as keyof typeof newOrder],
            ])
          )
        : {};

      const collectionUpdated = await tx
        .update(collection)
        .set({
          orderId: newOrderInserted[0].id,
          ...cascadeProperties,
        })
        .where(
          and(
            eq(collection.userId, userId),
            inArray(collection.id, collectionIds)
          )
        )
        .returning({ id: collection.id });

      if (!collectionUpdated || collectionUpdated.length === 0) {
        throw new Error("ORDER_ITEMS_NOT_FOUND");
      }

      return {};
    });

    return splitted;
  }

  async updateOrder(
    userId: string,
    orderId: string,
    updatedOrder: orderUpdateType,
    cascadeOptions: string[]
  ) {
    const updated = await db.transaction(async (tx) => {
      const orderUpdated = await tx
        .update(order)
        .set(updatedOrder)
        .where(and(eq(order.userId, userId), eq(order.id, orderId)))
        .returning();
      if (!orderUpdated || orderUpdated.length === 0) {
        throw new Error("ORDER_NOT_FOUND");
      }

      if (cascadeOptions.length > 0) {
        const cascadeProperties = Object.fromEntries(
          cascadeOptions.map((option) => [
            option,
            updatedOrder[option as keyof typeof updatedOrder],
          ])
        );

        const collectionUpdated = await tx
          .update(collection)
          .set({
            ...cascadeProperties,
          })
          .where(
            and(eq(collection.userId, userId), eq(collection.orderId, orderId))
          )
          .returning();
        if (!collectionUpdated || collectionUpdated.length === 0) {
          throw new Error("ORDER_ITEMS_NOT_FOUND");
        }
      }

      return {};
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
