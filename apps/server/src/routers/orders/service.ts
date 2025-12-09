import { db } from "@/db";
import { order, collection, item, item_release } from "@/db/schema/figure";
import { eq, and, inArray, sql, desc, asc, ilike, ne, gte, lte } from "drizzle-orm";
import type { orderInsertType, orderUpdateType } from "./model";

type OrderItem = {
  id: string;
  orderId: string | null;
  itemId: number;
  releaseId: string;
  status: "Owned" | "Ordered" | "Paid" | "Shipped" | "Sold";
  itemTitle: string;
  itemImage: string | null;
  price: string;
  count: number;
  shop: string;
  score: string;
  orderDate: string | null;
  paymentDate: string | null;
  shippingDate: string | null;
  collectionDate: string | null;
  shippingMethod:
    | "n/a"
    | "EMS"
    | "SAL"
    | "AIRMAIL"
    | "SURFACE"
    | "FEDEX"
    | "DHL"
    | "Colissimo"
    | "UPS"
    | "Domestic";
  releaseDate: string | null;
  releaseType: string | null;
  releasePrice: string | null;
  releaseCurrency: string | null;
  releaseBarcode: string | null;
  condition: "New" | "Pre-Owned";
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
    releaseMonthYearStart?: string,
    releaseMonthYearEnd?: string,
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
    orderDateStart?: string,
    orderDateEnd?: string,
    paymentDateStart?: string,
    paymentDateEnd?: string,
    shippingDateStart?: string,
    shippingDateEnd?: string,
    collectionDateStart?: string,
    collectionDateEnd?: string,
    status?: Array<"Ordered" | "Paid" | "Shipped" | "Owned">,
    totalMin?: string,
    totalMax?: string,
    shippingFeeMin?: string,
    shippingFeeMax?: string,
    taxesMin?: string,
    taxesMax?: string,
    dutiesMin?: string,
    dutiesMax?: string,
    tariffsMin?: string,
    tariffsMax?: string,
    miscFeesMin?: string,
    miscFeesMax?: string
  ) {
    const whereConditions = and(
      eq(order.userId, userId),
      search ? ilike(order.title, `%${search}%`) : undefined,
      shop ? inArray(order.shop, shop) : undefined,
      releaseMonthYearStart
        ? gte(order.releaseMonthYear, releaseMonthYearStart)
        : undefined,
      releaseMonthYearEnd
        ? lte(order.releaseMonthYear, releaseMonthYearEnd)
        : undefined,
      shippingMethod ? inArray(order.shippingMethod, shippingMethod) : undefined,
      orderDateStart ? gte(order.orderDate, orderDateStart) : undefined,
      orderDateEnd ? lte(order.orderDate, orderDateEnd) : undefined,
      paymentDateStart ? gte(order.paymentDate, paymentDateStart) : undefined,
      paymentDateEnd ? lte(order.paymentDate, paymentDateEnd) : undefined,
      shippingDateStart ? gte(order.shippingDate, shippingDateStart) : undefined,
      shippingDateEnd ? lte(order.shippingDate, shippingDateEnd) : undefined,
      collectionDateStart
        ? gte(order.collectionDate, collectionDateStart)
        : undefined,
      collectionDateEnd ? lte(order.collectionDate, collectionDateEnd) : undefined,
      status ? inArray(order.status, status) : undefined,
      shippingFeeMin ? gte(order.shippingFee, shippingFeeMin) : undefined,
      shippingFeeMax ? lte(order.shippingFee, shippingFeeMax) : undefined,
      taxesMin ? gte(order.taxes, taxesMin) : undefined,
      taxesMax ? lte(order.taxes, taxesMax) : undefined,
      dutiesMin ? gte(order.duties, dutiesMin) : undefined,
      dutiesMax ? lte(order.duties, dutiesMax) : undefined,
      tariffsMin ? gte(order.tariffs, tariffsMin) : undefined,
      tariffsMax ? lte(order.tariffs, tariffsMax) : undefined,
      miscFeesMin ? gte(order.miscFees, miscFeesMin) : undefined,
      miscFeesMax ? lte(order.miscFees, miscFeesMax) : undefined
    );

    const sortByColumn = (() => {
      switch (sortBy) {
        case "title":
          return order.title;
        case "shop":
          return order.shop;
        case "orderDate":
          return order.orderDate;
        case "paymentDate":
          return order.paymentDate;
        case "shippingDate":
          return order.shippingDate;
        case "collectionDate":
          return order.collectionDate;
        case "releaseMonthYear":
          return order.releaseMonthYear;
        case "shippingMethod":
          return order.shippingMethod;
        case "total":
          return sql<string>`COALESCE(SUM(${collection.price}::numeric), 0) + COALESCE(${order.shippingFee}::numeric, 0) + COALESCE(${order.taxes}::numeric, 0) + COALESCE(${order.duties}::numeric, 0) + COALESCE(${order.tariffs}::numeric, 0) + COALESCE(${order.miscFees}::numeric, 0)`;
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
        releaseMonthYear: order.releaseMonthYear,
        shippingMethod: order.shippingMethod,
        orderDate: order.orderDate,
        paymentDate: order.paymentDate,
        shippingDate: order.shippingDate,
        collectionDate: order.collectionDate,
        status: order.status,
        total: sql<string>`COALESCE(SUM(${collection.price}::numeric), 0) + COALESCE(${order.shippingFee}::numeric, 0) + COALESCE(${order.taxes}::numeric, 0) + COALESCE(${order.duties}::numeric, 0) + COALESCE(${order.tariffs}::numeric, 0) + COALESCE(${order.miscFees}::numeric, 0)`,
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
                'releaseId', ${collection.releaseId},
                'status', ${collection.status},
                'itemTitle', ${item.title},
                'itemImage', ${item.image},
                'price', ${collection.price}::text,
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
                'releasePrice', ${item_release.price}::text,
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
        totalCount: sql<number>`COUNT(*) OVER()`,
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
        order.releaseMonthYear,
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
        order.updatedAt
      )
      .having(
        and(
          totalMin
            ? sql`COALESCE(SUM(${collection.price}::numeric), 0) + COALESCE(${order.shippingFee}::numeric, 0) + COALESCE(${order.taxes}::numeric, 0) + COALESCE(${order.duties}::numeric, 0) + COALESCE(${order.tariffs}::numeric, 0) + COALESCE(${order.miscFees}::numeric, 0) >= ${totalMin}::numeric`
            : undefined,
          totalMax
            ? sql`COALESCE(SUM(${collection.price}::numeric), 0) + COALESCE(${order.shippingFee}::numeric, 0) + COALESCE(${order.taxes}::numeric, 0) + COALESCE(${order.duties}::numeric, 0) + COALESCE(${order.tariffs}::numeric, 0) + COALESCE(${order.miscFees}::numeric, 0) <= ${totalMax}::numeric`
            : undefined
        )
      )
      .orderBy(
        orderBy === "asc" ? asc(sortByColumn) : desc(sortByColumn),
        orderBy === "asc" ? asc(order.createdAt) : desc(order.createdAt)
      )
      .limit(limit)
      .offset(offset);

    const orderTotalsSubquery = db
      .select({
        orderId: order.id,
        collectionDate: order.collectionDate,
        paymentDate: order.paymentDate,
        status: order.status,
        total: sql<string>`COALESCE(SUM(${collection.price}::numeric), 0) + COALESCE(${order.shippingFee}::numeric, 0) + COALESCE(${order.taxes}::numeric, 0) + COALESCE(${order.duties}::numeric, 0) + COALESCE(${order.tariffs}::numeric, 0) + COALESCE(${order.miscFees}::numeric, 0)`.as('total'),
      })
      .from(order)
      .leftJoin(collection, eq(order.id, collection.orderId))
      .where(eq(order.userId, userId))
      .groupBy(order.id, order.collectionDate, order.paymentDate, order.status)
      .as("order_totals");

    const [orderStatsResult] = await db
      .select({
        totalOrders: sql<number>`COUNT(*)`,
        totalSpent: sql<string>`COALESCE(SUM(${orderTotalsSubquery.total}::numeric), 0)`,
        activeOrders: sql<number>`COUNT(CASE WHEN ${orderTotalsSubquery.status} != 'Owned' THEN 1 END)`,
        unpaidCosts: sql<string>`COALESCE(SUM(
          CASE WHEN ${orderTotalsSubquery.status} = 'Ordered'
            THEN ${orderTotalsSubquery.total}::numeric
            ELSE 0 
          END
        ), 0)`,
      })
      .from(orderTotalsSubquery);

    return { orders, orderStats: orderStatsResult };
  }

  async getOrder(userId: string, orderId: string) {
    const [orderInfo] = await db
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
        status: order.status,
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
                'id', ${collection.id},
                'orderId', ${collection.orderId},
                'itemId', ${item.id},
                'releaseId', ${collection.releaseId},
                'status', ${collection.status},
                'itemTitle', ${item.title},
                'itemImage', ${item.image},
                'price', ${collection.price}::text,
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
                'releasePrice', ${item_release.price}::text,
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

      const cascadeProperties =
        cascadeOptions.length > 0
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

      const cascadeProperties =
        cascadeOptions.length > 0
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

        await tx
          .update(collection)
          .set({
            ...cascadeProperties,
          })
          .where(
            and(eq(collection.userId, userId), eq(collection.orderId, orderId))
          );
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
            ne(collection.status, "Owned")
          )
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

  async deleteOrderItem(userId: string, orderId: string, collectionId: string) {
    const deleted = await db
      .delete(collection)
      .where(
        and(
          eq(collection.userId, userId),
          eq(collection.orderId, orderId),
          eq(collection.id, collectionId),
          ne(collection.status, "Owned")
        )
      )
      .returning();

    if (!deleted || deleted.length === 0) {
      throw new Error("ORDER_ITEM_NOT_FOUND");
    }

    return {};
  }

  async getOrderIdsAndTitles(userId: string, title?: string) {
    const orderIdsAndTitles = await db
      .select({ id: order.id, title: order.title })
      .from(order)
      .where(
        and(
          eq(order.userId, userId),
          title ? ilike(order.title, `%${title}%`) : undefined
        )
      )
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
    orderIds: string[]
  ) {
    const moved = await db
      .update(collection)
      .set({ orderId: targetOrderId })
      .where(
        and(
          eq(collection.userId, userId),
          inArray(collection.id, collectionIds),
          inArray(collection.orderId, orderIds)
        )
      )
      .returning();

    if (!moved || moved.length === 0) {
      throw new Error("FAILED_TO_MOVE_ITEMS");
    }

    return {};
  }
}

export default new OrdersService();
