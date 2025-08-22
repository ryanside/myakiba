import { db } from "@/db";
import { order, collection, item_release, item } from "@/db/schema/figure";
import { eq, and, asc, inArray } from "drizzle-orm";
import type { orderInsertType, orderUpdateType } from "./model";
import type { updateCollectionType } from "../collection/model";

class OrdersService {
  async getOrders(userId: string) {
    try {
      const orders = await db
        .select({
          title: order.title,
          shop: order.shop,
          orderDate: order.orderDate,
          paymentDate: order.paymentDate,
          shippingDate: order.shippingDate,
          collectionDate: order.collectionDate,
          shippingMethod: order.shippingMethod,
          shippingFee: order.shippingFee,
          miscellaneousAmount: order.miscellaneousAmount,
          notes: order.notes,
        })
        .from(order)
        .innerJoin(collection, eq(order.id, collection.orderId))
        .innerJoin(item, eq(collection.itemId, item.id))
        .innerJoin(item_release, eq(collection.releaseId, item_release.id))
        .where(eq(order.userId, userId))
        .orderBy(asc(order.orderDate));

      return orders;
    } catch (error) {
      console.error("Failed to get orders");
      throw error;
    }
  }

  async createOrder(newOrder: orderInsertType) {
    try {
      const created = await db.insert(order).values({
        ...newOrder,
      });

      return created;
    } catch (error) {
      console.error("Failed to create order");
      throw error;
    }
  }

  async updateOrder(
    userId: string,
    orderId: string,
    updatedOrder: orderUpdateType
  ) {
    try {
      const updated = await db
        .update(order)
        .set(updatedOrder)
        .where(and(eq(order.id, orderId), eq(order.userId, userId)));
      return updated;
    } catch (error) {
      console.error("Failed to update order");
      throw error;
    }
  }

  async assignOrderIdToCollectionItems(
    userId: string,
    orderId: string,
    collectionIds: string[]
  ) {
    try {
      const assigned = await db
        .update(collection)
        .set({
          orderId: orderId,
        })
        .where(
          and(
            eq(collection.userId, userId),
            inArray(collection.id, collectionIds)
          )
        );

      return assigned;
    } catch (error) {
      console.error("Failed to assign order to collection item(s)");
      throw error;
    }
  }

  async deleteOrder(userId: string, orderId: string) {
    try {
      const deleted = await db
        .delete(order)
        .where(and(eq(order.userId, userId), eq(order.id, orderId)));

      return deleted;
    } catch (error) {
      console.error("Failed to delete order");
      throw error;
    }
  }

  async getSingleItemOrders(userId: string) {
    try {
      const orders = await db
        .select()
        .from(collection)
        .innerJoin(item, eq(collection.itemId, item.id))
        .innerJoin(item_release, eq(collection.releaseId, item_release.id))
        .where(
          and(eq(collection.userId, userId), eq(collection.status, "Ordered"))
        );

      return orders;
    } catch (error) {
      console.error("Failed to get single item orders");
      throw error;
    }
  }

  async updateSingleItemOrder(
    userId: string,
    id: string,
    data: updateCollectionType
  ) {
    try {
      const updateCollection = db
        .update(collection)
        .set(data)
        .where(and(eq(collection.userId, userId), eq(collection.id, id)));

      return updateCollection;
    } catch (error) {
      console.error("Failed to update single item order");
      throw error;
    }
  }

  async deleteSingleItemOrder(userId: string, id: string) {
    try {
      const deleted = await db
        .delete(collection)
        .where(and(eq(collection.userId, userId), eq(collection.id, id)));

      return deleted;
    } catch (error) {
      console.error("Failed to delete single item order");
      throw error;
    }
  }
}

export default new OrdersService();
