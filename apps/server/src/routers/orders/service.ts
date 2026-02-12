import type { ShippingMethod } from "@myakiba/types";
import type { OrderCascadeOption } from "@myakiba/constants/orders";
import { db } from "@myakiba/db";
import { order, collection, item, item_release } from "@myakiba/db/schema/figure";
import { eq, and, inArray, sql, desc, asc, ilike, ne, gte, lte } from "drizzle-orm";
import type { OrderInsertType, OrderUpdateType } from "./model";
import type { OrderStatus, Condition } from "@myakiba/types";

type OrderItem = {
  id: string;
  orderId: string | null;
  itemId: string;
  itemExternalId: number | null;
  releaseId: string;
  status: OrderStatus;
  itemTitle: string;
  itemImage: string | null;
  price: number;
  count: number;
  shop: string;
  score: string;
  orderDate: string | null;
  paymentDate: string | null;
  shippingDate: string | null;
  collectionDate: string | null;
  shippingMethod: ShippingMethod;
  releaseDate: string | null;
  releaseType: string | null;
  releasePrice: number | null;
  releaseCurrency: string | null;
  releaseBarcode: string | null;
  condition: Condition;
  tags: string[];
  notes: string;
};

class OrdersService {
  async getOrders(
    userId: string,
    limit: number,
    offset: number,
    sortBy: string,
    orderBy: string,
    search?: string,
    shop?: Array<string>,
    releaseDateStart?: string,
    releaseDateEnd?: string,
    shippingMethod?: ReadonlyArray<ShippingMethod>,
    orderDateStart?: string,
    orderDateEnd?: string,
    paymentDateStart?: string,
    paymentDateEnd?: string,
    shippingDateStart?: string,
    shippingDateEnd?: string,
    collectionDateStart?: string,
    collectionDateEnd?: string,
    status?: Array<OrderStatus>,
    totalMin?: number,
    totalMax?: number,
    shippingFeeMin?: number,
    shippingFeeMax?: number,
    taxesMin?: number,
    taxesMax?: number,
    dutiesMin?: number,
    dutiesMax?: number,
    tariffsMin?: number,
    tariffsMax?: number,
    miscFeesMin?: number,
    miscFeesMax?: number,
  ) {
    const whereConditions = and(
      eq(order.userId, userId),
      search ? ilike(order.title, `%${search}%`) : undefined,
      shop ? inArray(order.shop, shop) : undefined,
      releaseDateStart ? gte(order.releaseDate, releaseDateStart) : undefined,
      releaseDateEnd ? lte(order.releaseDate, releaseDateEnd) : undefined,
      shippingMethod ? inArray(order.shippingMethod, shippingMethod) : undefined,
      orderDateStart ? gte(order.orderDate, orderDateStart) : undefined,
      orderDateEnd ? lte(order.orderDate, orderDateEnd) : undefined,
      paymentDateStart ? gte(order.paymentDate, paymentDateStart) : undefined,
      paymentDateEnd ? lte(order.paymentDate, paymentDateEnd) : undefined,
      shippingDateStart ? gte(order.shippingDate, shippingDateStart) : undefined,
      shippingDateEnd ? lte(order.shippingDate, shippingDateEnd) : undefined,
      collectionDateStart ? gte(order.collectionDate, collectionDateStart) : undefined,
      collectionDateEnd ? lte(order.collectionDate, collectionDateEnd) : undefined,
      status ? inArray(order.status, status) : undefined,
      shippingFeeMin !== undefined ? gte(order.shippingFee, shippingFeeMin) : undefined,
      shippingFeeMax !== undefined ? lte(order.shippingFee, shippingFeeMax) : undefined,
      taxesMin !== undefined ? gte(order.taxes, taxesMin) : undefined,
      taxesMax !== undefined ? lte(order.taxes, taxesMax) : undefined,
      dutiesMin !== undefined ? gte(order.duties, dutiesMin) : undefined,
      dutiesMax !== undefined ? lte(order.duties, dutiesMax) : undefined,
      tariffsMin !== undefined ? gte(order.tariffs, tariffsMin) : undefined,
      tariffsMax !== undefined ? lte(order.tariffs, tariffsMax) : undefined,
      miscFeesMin !== undefined ? gte(order.miscFees, miscFeesMin) : undefined,
      miscFeesMax !== undefined ? lte(order.miscFees, miscFeesMax) : undefined,
    );

    const sortByColumn = (() => {
      switch (sortBy) {
        case "title":
          return order.title;
        case "shop":
          return sql`LOWER(${order.shop})`;
        case "orderDate":
          return order.orderDate;
        case "paymentDate":
          return order.paymentDate;
        case "shippingDate":
          return order.shippingDate;
        case "collectionDate":
          return order.collectionDate;
        case "releaseDate":
          return order.releaseDate;
        case "shippingMethod":
          return order.shippingMethod;
        case "total":
          return sql<number>`COALESCE(SUM(${collection.price}), 0) + COALESCE(${order.shippingFee}, 0) + COALESCE(${order.taxes}, 0) + COALESCE(${order.duties}, 0) + COALESCE(${order.tariffs}, 0) + COALESCE(${order.miscFees}, 0)`;
        case "shippingFee":
          return order.shippingFee;
        case "taxes":
          return order.taxes;
        case "duties":
          return order.duties;
        case "tariffs":
          return order.tariffs;
        case "miscFees":
          return order.miscFees;
        case "status":
          return order.status;
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
        releaseDate: order.releaseDate,
        shippingMethod: order.shippingMethod,
        orderDate: order.orderDate,
        paymentDate: order.paymentDate,
        shippingDate: order.shippingDate,
        collectionDate: order.collectionDate,
        status: order.status,
        total: sql<number>`COALESCE(SUM(${collection.price}), 0) + COALESCE(${order.shippingFee}, 0) + COALESCE(${order.taxes}, 0) + COALESCE(${order.duties}, 0) + COALESCE(${order.tariffs}, 0) + COALESCE(${order.miscFees}, 0)`,
        shippingFee: order.shippingFee,
        taxes: order.taxes,
        duties: order.duties,
        tariffs: order.tariffs,
        miscFees: order.miscFees,
        notes: order.notes,
        itemCount: sql<number>`COUNT(${collection.id})`,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        items: sql<OrderItem[]>`
          COALESCE(
            JSON_AGG(
              JSON_BUILD_OBJECT(
                'id', ${collection.id},
                'orderId', ${collection.orderId},
                'itemId', ${item.id},
                'itemExternalId', ${item.externalId},
                'releaseId', ${collection.releaseId},
                'status', ${collection.status},
                'itemTitle', ${item.title},
                'itemImage', ${item.image},
                'price', ${collection.price},
                'count', ${collection.count},
                'shop', ${collection.shop},
                'score', ${collection.score}::text, 
                'orderDate', ${collection.orderDate},
                'paymentDate', ${collection.paymentDate},
                'shippingDate', ${collection.shippingDate},
                'collectionDate', ${collection.collectionDate},
                'shippingMethod', ${collection.shippingMethod},
                'releaseDate', ${item_release.date},
                'releaseType', ${item_release.type},
                'releasePrice', ${item_release.price},
                'releaseCurrency', ${item_release.priceCurrency},
                'releaseBarcode', ${item_release.barcode},
                'condition', ${collection.condition},
                'tags', ${collection.tags},
                'notes', ${collection.notes}
              )
              ORDER BY ${item.title}
            ) FILTER (WHERE ${collection.id} IS NOT NULL),
            '[]'::json
          )
        `,
      })
      .from(order)
      .leftJoin(collection, eq(order.id, collection.orderId))
      .leftJoin(item, eq(collection.itemId, item.id))
      .leftJoin(item_release, eq(collection.releaseId, item_release.id))
      .where(whereConditions)
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
          totalMin !== undefined
            ? sql`COALESCE(SUM(${collection.price}), 0) + COALESCE(${order.shippingFee}, 0) + COALESCE(${order.taxes}, 0) + COALESCE(${order.duties}, 0) + COALESCE(${order.tariffs}, 0) + COALESCE(${order.miscFees}, 0) >= ${totalMin}`
            : undefined,
          totalMax !== undefined
            ? sql`COALESCE(SUM(${collection.price}), 0) + COALESCE(${order.shippingFee}, 0) + COALESCE(${order.taxes}, 0) + COALESCE(${order.duties}, 0) + COALESCE(${order.tariffs}, 0) + COALESCE(${order.miscFees}, 0) <= ${totalMax}`
            : undefined,
        ),
      )
      .orderBy(
        orderBy === "asc" ? asc(sortByColumn) : desc(sortByColumn),
        orderBy === "asc" ? asc(order.createdAt) : desc(order.createdAt),
      )
      .limit(limit)
      .offset(offset);

    return orders;
  }

  async getOrder(userId: string, orderId: string) {
    const [orderInfo] = await db
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
        total: sql<number>`COALESCE(SUM(${collection.price}), 0) + COALESCE(${order.shippingFee}, 0) + COALESCE(${order.taxes}, 0) + COALESCE(${order.duties}, 0) + COALESCE(${order.tariffs}, 0) + COALESCE(${order.miscFees}, 0)`,
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
                'id', ${collection.id},
                'orderId', ${collection.orderId},
                'itemId', ${item.id},
                'itemExternalId', ${item.externalId},
                'releaseId', ${collection.releaseId},
                'status', ${collection.status},
                'itemTitle', ${item.title},
                'itemImage', ${item.image},
                'price', ${collection.price},
                'count', ${collection.count},
                'shop', ${collection.shop},
                'score', ${collection.score}::text,
                'orderDate', ${collection.orderDate},
                'paymentDate', ${collection.paymentDate},
                'shippingDate', ${collection.shippingDate},
                'collectionDate', ${collection.collectionDate},
                'shippingMethod', ${collection.shippingMethod},
                'releaseDate', ${item_release.date},
                'releaseType', ${item_release.type},
                'releasePrice', ${item_release.price},
                'releaseCurrency', ${item_release.priceCurrency},
                'releaseBarcode', ${item_release.barcode},
                'condition', ${collection.condition},
                'tags', ${collection.tags},
                'notes', ${collection.notes}
              )
              ORDER BY ${item.title}
            ) FILTER (WHERE ${collection.id} IS NOT NULL),
            '[]'::json
          )
        `,
      })
      .from(order)
      .leftJoin(collection, eq(order.id, collection.orderId))
      .leftJoin(item, eq(collection.itemId, item.id))
      .leftJoin(item_release, eq(collection.releaseId, item_release.id))
      .where(and(eq(order.userId, userId), eq(order.id, orderId)))
      .groupBy(order.id);

    if (!orderInfo) {
      throw new Error("ORDER_NOT_FOUND");
    }

    return orderInfo;
  }

  async mergeOrders(
    userId: string,
    orderIds: string[],
    newOrder: Omit<OrderInsertType, "userId">,
    cascadeOptions: ReadonlyArray<OrderCascadeOption>,
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

      const cascadeProperties =
        cascadeOptions.length > 0
          ? Object.fromEntries(
              cascadeOptions.map((option) => [option, newOrder[option as keyof typeof newOrder]]),
            )
          : {};

      const collectionUpdated = await tx
        .update(collection)
        .set({
          orderId: newOrderInserted[0].id,
          ...cascadeProperties,
        })
        .where(and(eq(collection.userId, userId), inArray(collection.orderId, orderIds)))
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
    newOrder: Omit<OrderInsertType, "userId">,
    cascadeOptions: ReadonlyArray<OrderCascadeOption>,
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

      const cascadeProperties =
        cascadeOptions.length > 0
          ? Object.fromEntries(
              cascadeOptions.map((option) => [option, newOrder[option as keyof typeof newOrder]]),
            )
          : {};

      const collectionUpdated = await tx
        .update(collection)
        .set({
          orderId: newOrderInserted[0].id,
          ...cascadeProperties,
        })
        .where(and(eq(collection.userId, userId), inArray(collection.id, collectionIds)))
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
    updatedOrder: OrderUpdateType,
    cascadeOptions: ReadonlyArray<OrderCascadeOption>,
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
          ]),
        );

        await tx
          .update(collection)
          .set({
            ...cascadeProperties,
          })
          .where(and(eq(collection.userId, userId), eq(collection.orderId, orderId)));
      }

      return {};
    });

    return updated;
  }

  async deleteOrders(userId: string, orderIds: string[]) {
    const deleted = await db.transaction(async (tx) => {
      await tx
        .delete(collection)
        .where(
          and(
            eq(collection.userId, userId),
            inArray(collection.orderId, orderIds),
            ne(collection.status, "Owned"),
          ),
        );

      const deletedOrders = await tx
        .delete(order)
        .where(and(eq(order.userId, userId), inArray(order.id, orderIds)))
        .returning();

      if (!deletedOrders || deletedOrders.length === 0) {
        throw new Error("ORDERS_NOT_FOUND");
      }

      return {};
    });

    return deleted;
  }

  async deleteOrderItem(userId: string, _orderId: string, collectionId: string) {
    // TODO: Refactor data sent to the server to reduce this to a single query
    const updated = await db
      .update(collection)
      .set({ orderId: null })
      .where(
        and(
          eq(collection.userId, userId),
          eq(collection.id, collectionId),
          eq(collection.status, "Owned"),
        ),
      )
      .returning();

    const deleted = await db
      .delete(collection)
      .where(
        and(
          eq(collection.userId, userId),
          eq(collection.id, collectionId),
          ne(collection.status, "Owned"),
        ),
      )
      .returning();

    if (updated.length === 0 && deleted.length === 0) {
      throw new Error("ORDER_ITEMS_NOT_FOUND");
    }

    return {};
  }

  async deleteOrderItems(userId: string, collectionIds: string[]) {
    // TODO: Refactor data sent to the server to reduce this to a single query
    const updated = await db
      .update(collection)
      .set({ orderId: null })
      .where(
        and(
          eq(collection.userId, userId),
          inArray(collection.id, collectionIds),
          eq(collection.status, "Owned"),
        ),
      )
      .returning();

    const deleted = await db
      .delete(collection)
      .where(
        and(
          eq(collection.userId, userId),
          inArray(collection.id, collectionIds),
          ne(collection.status, "Owned"),
        ),
      )
      .returning();

    if (updated.length === 0 && deleted.length === 0) {
      throw new Error("ORDER_ITEMS_NOT_FOUND");
    }

    return {};
  }

  async getOrderIdsAndTitles(userId: string, title?: string) {
    const orderIdsAndTitles = await db
      .select({ id: order.id, title: order.title })
      .from(order)
      .where(and(eq(order.userId, userId), title ? ilike(order.title, `%${title}%`) : undefined))
      .groupBy(order.id, order.title);

    if (!orderIdsAndTitles) {
      throw new Error("FAILED_TO_GET_ORDER_IDS_AND_TITLES");
    }

    return orderIdsAndTitles;
  }

  async moveItems(
    userId: string,
    targetOrderId: string,
    collectionIds: string[],
    orderIds: string[],
  ) {
    const moved = await db
      .update(collection)
      .set({ orderId: targetOrderId })
      .where(
        and(
          eq(collection.userId, userId),
          inArray(collection.id, collectionIds),
          inArray(collection.orderId, orderIds),
        ),
      )
      .returning();

    if (!moved || moved.length === 0) {
      throw new Error("FAILED_TO_MOVE_ITEMS");
    }

    return {};
  }
}

export default new OrdersService();
