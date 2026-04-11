import type { OrderCascadeOption } from "@myakiba/contracts/orders/constants";
import { db } from "@myakiba/db/client";
import { order, collection, item, item_release } from "@myakiba/db/schema/figure";
import { eq, and, inArray, sql, desc, asc, ilike, ne, gte, lte, or, isNull } from "drizzle-orm";
import type { OrderStatus, ShippingMethod } from "@myakiba/contracts/shared/types";
import type { OrderInsertType, OrderUpdateType } from "./model";

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
        images: sql<string[]>`
          COALESCE(
            ARRAY_AGG(DISTINCT ${item.image}) FILTER (WHERE ${item.image} IS NOT NULL),
            ARRAY[]::text[]
          )
        `,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        totalCount: sql<number>`COUNT(*) OVER()`,
      })
      .from(order)
      .leftJoin(collection, eq(order.id, collection.orderId))
      .leftJoin(item, eq(collection.itemId, item.id))
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

    return orders.map((currentOrder) => ({
      ...currentOrder,
      images: currentOrder.images.slice(0, 4),
    }));
  }

  async getOrder(userId: string, orderId: string) {
    const orderInfoRows = await db
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
      })
      .from(order)
      .leftJoin(collection, eq(order.id, collection.orderId))
      .where(and(eq(order.userId, userId), eq(order.id, orderId)))
      .groupBy(order.id);

    if (orderInfoRows.length === 0) {
      throw new Error("ORDER_NOT_FOUND");
    }

    return orderInfoRows[0];
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
      if (collectionUpdated.length === 0) {
        throw new Error("ORDER_ITEMS_NOT_FOUND");
      }

      const deletedOrders = await tx
        .delete(order)
        .where(and(eq(order.userId, userId), inArray(order.id, orderIds)))
        .returning({ id: order.id });
      if (deletedOrders.length === 0) {
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
      if (newOrderInserted.length === 0) {
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

      if (collectionUpdated.length === 0) {
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
      if (orderUpdated.length === 0) {
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

      if (deletedOrders.length === 0) {
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

    return orderIdsAndTitles;
  }

  async moveItems(
    userId: string,
    targetOrderId: string,
    collectionIds: string[],
    orderIds?: readonly string[],
  ) {
    const sourceOrderFilter =
      orderIds && orderIds.length > 0
        ? or(inArray(collection.orderId, orderIds), isNull(collection.orderId))
        : undefined;

    const moved = await db
      .update(collection)
      .set({ orderId: targetOrderId })
      .where(
        and(
          eq(collection.userId, userId),
          inArray(collection.id, collectionIds),
          sourceOrderFilter,
        ),
      )
      .returning();

    if (moved.length === 0) {
      throw new Error("FAILED_TO_MOVE_ITEMS");
    }

    return {};
  }

  async getOrderStats(userId: string): Promise<{
    totalOrders: number;
    totalSpent: number;
    activeOrders: number;
    unpaidCosts: number;
  }> {
    const orderTotals = db
      .select({
        orderId: order.id,
        status: order.status,
        total:
          sql<number>`COALESCE(SUM(${collection.price}), 0) + COALESCE(${order.shippingFee}, 0) + COALESCE(${order.taxes}, 0) + COALESCE(${order.duties}, 0) + COALESCE(${order.tariffs}, 0) + COALESCE(${order.miscFees}, 0)`.as(
            "total",
          ),
      })
      .from(order)
      .leftJoin(collection, eq(order.id, collection.orderId))
      .where(eq(order.userId, userId))
      .groupBy(
        order.id,
        order.status,
        order.shippingFee,
        order.taxes,
        order.duties,
        order.tariffs,
        order.miscFees,
      )
      .as("order_totals");

    const [stats] = await db
      .select({
        totalOrders: sql<number>`COUNT(*)`,
        totalSpent: sql<number>`COALESCE(SUM(${orderTotals.total}) FILTER (WHERE ${orderTotals.status} != 'Ordered'), 0)`,
        activeOrders: sql<number>`COUNT(*) FILTER (WHERE ${orderTotals.status} != 'Owned')`,
        unpaidCosts: sql<number>`COALESCE(SUM(${orderTotals.total}) FILTER (WHERE ${orderTotals.status} = 'Ordered'), 0)`,
      })
      .from(orderTotals);

    return stats ?? { totalOrders: 0, totalSpent: 0, activeOrders: 0, unpaidCosts: 0 };
  }

  async getOrderItemReleases(userId: string, orderId: string) {
    return db
      .select({
        releaseDate: item_release.date,
        itemImage: item.image,
      })
      .from(collection)
      .innerJoin(item, eq(collection.itemId, item.id))
      .innerJoin(item_release, eq(collection.releaseId, item_release.id))
      .where(and(eq(collection.userId, userId), eq(collection.orderId, orderId)))
      .orderBy(asc(item_release.date));
  }

  async getOrderItems(userId: string, orderId: string, limit: number, offset: number) {
    const items = await db
      .select({
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
        totalCount: sql<number>`COUNT(*) OVER()`,
      })
      .from(collection)
      .innerJoin(item, eq(collection.itemId, item.id))
      .leftJoin(item_release, eq(collection.releaseId, item_release.id))
      .where(and(eq(collection.userId, userId), eq(collection.orderId, orderId)))
      .orderBy(asc(item.title))
      .limit(limit)
      .offset(offset);

    return items;
  }
}

export default new OrdersService();
