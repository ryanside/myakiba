import { Elysia, status } from "elysia";
import OrdersService from "./service";
import * as z from "zod";
import {
  orderInsertSchema,
  orderUpdateSchema,
  ordersQuerySchema,
  orderIdParamSchema,
  orderItemsQuerySchema,
} from "./model";
import { cascadeOptionsSchema } from "@myakiba/contracts/orders/schema";
import { tryCatch } from "@myakiba/utils/result";
import { betterAuth } from "@/middleware/better-auth";
import { evlog } from "evlog/elysia";
import type { Order, OrderListItem } from "@myakiba/contracts/orders/types";

const ordersRouter = new Elysia({ prefix: "/orders" })
  .use(betterAuth)
  .use(evlog())
  .get(
    "/",
    async ({ query, user, log }) => {
      if (!user) {
        log.set({ outcome: "unauthorized" });
        return status(401, "Unauthorized");
      }

      log.set({ action: "orders.list", user: { id: user.id } });

      const { data: result, error } = await tryCatch(
        OrdersService.getOrders(
          user.id,
          query.limit,
          query.offset,
          query.sort,
          query.order,
          query.search,
          query.shop,
          query.releaseDateStart,
          query.releaseDateEnd,
          query.shipMethod,
          query.orderDateStart,
          query.orderDateEnd,
          query.payDateStart,
          query.payDateEnd,
          query.shipDateStart,
          query.shipDateEnd,
          query.colDateStart,
          query.colDateEnd,
          query.status,
          query.totalMin,
          query.totalMax,
          query.shippingFeeMin,
          query.shippingFeeMax,
          query.taxesMin,
          query.taxesMax,
          query.dutiesMin,
          query.dutiesMax,
          query.tariffsMin,
          query.tariffsMax,
          query.miscFeesMin,
          query.miscFeesMax,
        ),
      );

      if (error) {
        log.error(error, { step: "get_orders" });
        log.set({ outcome: "error" });
        return status(500, "Failed to get orders");
      }

      const orders: OrderListItem[] = result.map((order) => ({
        ...order,
        createdAt: order.createdAt.toISOString(),
        updatedAt: order.updatedAt.toISOString(),
      }));

      log.set({ orders: { resultCount: orders.length }, outcome: "success" });
      return orders;
    },
    { query: ordersQuerySchema, auth: true },
  )
  .get(
    "/stats",
    async ({ user, log }) => {
      if (!user) {
        log.set({ outcome: "unauthorized" });
        return status(401, "Unauthorized");
      }

      log.set({ action: "orders.stats", user: { id: user.id } });

      const { data: stats, error } = await tryCatch(OrdersService.getOrderStats(user.id));

      if (error) {
        log.error(error, { step: "get_order_stats" });
        log.set({ outcome: "error" });
        return status(500, "Failed to get order stats");
      }

      log.set({ outcome: "success" });
      return stats;
    },
    { auth: true },
  )
  .get(
    "/:orderId",
    async ({ params, user, log }) => {
      if (!user) {
        log.set({ outcome: "unauthorized" });
        return status(401, "Unauthorized");
      }

      log.set({ action: "orders.get", user: { id: user.id }, order: { id: params.orderId } });

      const { data: order, error } = await tryCatch(
        OrdersService.getOrder(user.id, params.orderId),
      );

      if (error) {
        if (error.message === "ORDER_NOT_FOUND") {
          log.set({ outcome: "not_found" });
          return status(404, "Order not found");
        }

        log.error(error, { step: "get_order" });
        log.set({ outcome: "error" });
        return status(500, "Failed to get order");
      }

      const serializedOrder: Order = {
        ...order,
        createdAt: order.createdAt.toISOString(),
        updatedAt: order.updatedAt.toISOString(),
      };

      log.set({ outcome: "success" });
      return serializedOrder;
    },
    { params: orderIdParamSchema, auth: true },
  )
  .get(
    "/:orderId/items",
    async ({ params, query, user, log }) => {
      if (!user) {
        log.set({ outcome: "unauthorized" });
        return status(401, "Unauthorized");
      }

      log.set({
        action: "orders.items",
        user: { id: user.id },
        order: { id: params.orderId },
      });

      const { data: items, error } = await tryCatch(
        OrdersService.getOrderItems(user.id, params.orderId, query.limit, query.offset),
      );

      if (error) {
        log.error(error, { step: "get_order_items" });
        log.set({ outcome: "error" });
        return status(500, "Failed to get order items");
      }

      log.set({ orders: { itemCount: items.length }, outcome: "success" });
      return items;
    },
    {
      params: orderIdParamSchema,
      query: orderItemsQuerySchema,
      auth: true,
    },
  )
  .post(
    "/merge",
    async ({ body, user, log }) => {
      if (!user) {
        log.set({ outcome: "unauthorized" });
        return status(401, "Unauthorized");
      }

      log.set({
        action: "orders.merge",
        user: { id: user.id },
        merge: { orderCount: body.orderIds.length },
      });

      const { error } = await tryCatch(
        OrdersService.mergeOrders(user.id, body.orderIds, body.newOrder, body.cascadeOptions),
      );

      if (error) {
        if (error.message === "FAILED_TO_INSERT_NEW_ORDER") {
          log.error(error, { step: "merge_orders" });
          log.set({ outcome: "error" });
          return status(500, "Failed to insert new order");
        }
        if (error.message === "ORDER_ITEMS_NOT_FOUND") {
          log.set({ outcome: "not_found" });
          return status(404, "Order items not found");
        }
        if (error.message === "ORDERS_NOT_FOUND") {
          log.set({ outcome: "not_found" });
          return status(404, "One or more orders not found");
        }
        if (error.message === "FAILED_TO_FETCH_NEW_ORDER") {
          log.error(error, { step: "merge_orders" });
          log.set({ outcome: "error" });
          return status(500, "Failed to fetch new order details");
        }

        log.error(error, { step: "merge_orders" });
        log.set({ outcome: "error" });
        return status(500, "Failed to merge orders");
      }

      log.set({ outcome: "success" });
      return "Orders merged successfully";
    },
    {
      body: z.object({
        orderIds: z.array(z.string()),
        newOrder: orderInsertSchema.omit({ userId: true }),
        cascadeOptions: cascadeOptionsSchema,
      }),
      auth: true,
    },
  )
  .post(
    "/split",
    async ({ body, user, log }) => {
      if (!user) {
        log.set({ outcome: "unauthorized" });
        return status(401, "Unauthorized");
      }

      log.set({
        action: "orders.split",
        user: { id: user.id },
        split: { itemCount: body.collectionIds.length },
      });

      const { error } = await tryCatch(
        OrdersService.splitOrders(user.id, body.collectionIds, body.newOrder, body.cascadeOptions),
      );

      if (error) {
        if (error.message === "COLLECTION_IDS_REQUIRED") {
          log.set({ outcome: "bad_request" });
          return status(400, "Collection ids are required");
        }
        if (error.message === "FAILED_TO_INSERT_NEW_ORDER") {
          log.error(error, { step: "split_orders" });
          log.set({ outcome: "error" });
          return status(500, "Failed to insert new order");
        }
        if (error.message === "ORDER_ITEMS_NOT_FOUND") {
          log.set({ outcome: "not_found" });
          return status(404, "Order items not found");
        }

        log.error(error, { step: "split_orders" });
        log.set({ outcome: "error" });
        return status(500, "Failed to split orders");
      }

      log.set({ outcome: "success" });
      return "Items split successfully";
    },
    {
      body: z.object({
        collectionIds: z.array(z.string()),
        newOrder: orderInsertSchema.omit({ userId: true }),
        cascadeOptions: cascadeOptionsSchema,
      }),
      auth: true,
    },
  )
  .put(
    "/move-items",
    async ({ body, user, log }) => {
      if (!user) {
        log.set({ outcome: "unauthorized" });
        return status(401, "Unauthorized");
      }

      log.set({
        action: "orders.move_items",
        user: { id: user.id },
        move: { itemCount: body.collectionIds.length },
      });

      const { error } = await tryCatch(
        OrdersService.moveItems(user.id, body.targetOrderId, body.collectionIds, body.orderIds),
      );

      if (error) {
        log.error(error, { step: "move_items" });
        log.set({ outcome: "error" });
        return status(500, "Failed to move items");
      }

      log.set({ outcome: "success" });
      return "Items moved successfully";
    },
    {
      body: z.object({
        targetOrderId: z.string(),
        collectionIds: z.array(z.string()),
        orderIds: z.array(z.string()),
      }),
      auth: true,
    },
  )
  .put(
    "/:orderId",
    async ({ params, body, user, log }) => {
      if (!user) {
        log.set({ outcome: "unauthorized" });
        return status(401, "Unauthorized");
      }

      log.set({
        action: "orders.update",
        user: { id: user.id },
        order: { id: params.orderId },
      });

      const { error } = await tryCatch(
        OrdersService.updateOrder(user.id, params.orderId, body.order, body.cascadeOptions),
      );

      if (error) {
        if (error.message === "ORDER_NOT_FOUND") {
          log.set({ outcome: "not_found" });
          return status(404, "Order not found");
        }

        log.error(error, { step: "update_order" });
        log.set({ outcome: "error" });
        return status(500, "Failed to update order");
      }

      log.set({ outcome: "success" });
      return "Order updated successfully";
    },
    {
      params: orderIdParamSchema,
      body: z.object({
        order: orderUpdateSchema,
        cascadeOptions: cascadeOptionsSchema,
      }),
      auth: true,
    },
  )
  .delete(
    "/",
    async ({ body, user, log }) => {
      if (!user) {
        log.set({ outcome: "unauthorized" });
        return status(401, "Unauthorized");
      }

      log.set({
        action: "orders.delete_many",
        user: { id: user.id },
        delete: { orderCount: body.orderIds.length },
      });

      const { error } = await tryCatch(OrdersService.deleteOrders(user.id, body.orderIds));

      if (error) {
        if (error.message === "ORDERS_ITEMS_NOT_FOUND") {
          log.set({ outcome: "not_found" });
          return status(404, "One or more orders items not found");
        }

        if (error.message === "ORDERS_NOT_FOUND") {
          log.set({ outcome: "not_found" });
          return status(404, "One or more orders not found");
        }

        log.error(error, { step: "delete_orders" });
        log.set({ outcome: "error" });
        return status(500, "Failed to delete orders");
      }

      log.set({ outcome: "success" });
      return "Orders deleted successfully";
    },
    {
      body: z.object({ orderIds: z.array(z.string()) }),
      auth: true,
    },
  )
  .delete(
    "/items",
    async ({ body, user, log }) => {
      if (!user) {
        log.set({ outcome: "unauthorized" });
        return status(401, "Unauthorized");
      }

      log.set({
        action: "orders.delete_items",
        user: { id: user.id },
        delete: { itemCount: body.collectionIds.length },
      });

      const { error } = await tryCatch(OrdersService.deleteOrderItems(user.id, body.collectionIds));

      if (error) {
        if (error.message === "ORDER_ITEMS_NOT_FOUND") {
          log.set({ outcome: "not_found" });
          return status(404, "One or more order items not found");
        }

        log.error(error, { step: "delete_order_items" });
        log.set({ outcome: "error" });
        return status(500, "Failed to delete order items");
      }

      log.set({ outcome: "success" });
      return "Order items deleted successfully";
    },
    {
      body: z.object({ collectionIds: z.array(z.string()) }),
      auth: true,
    },
  )
  .delete(
    "/:orderId/items/:collectionId",
    async ({ params, user, log }) => {
      if (!user) {
        log.set({ outcome: "unauthorized" });
        return status(401, "Unauthorized");
      }

      log.set({
        action: "orders.delete_item",
        user: { id: user.id },
        order: { id: params.orderId },
        item: { collectionId: params.collectionId },
      });

      const { error } = await tryCatch(
        OrdersService.deleteOrderItem(user.id, params.orderId, params.collectionId),
      );

      if (error) {
        if (error.message === "ORDER_ITEM_NOT_FOUND") {
          log.set({ outcome: "not_found" });
          return status(404, "Order item not found");
        }

        log.error(error, { step: "delete_order_item" });
        log.set({ outcome: "error" });
        return status(500, "Failed to delete order item");
      }

      log.set({ outcome: "success" });
      return "Order item deleted successfully";
    },
    {
      params: z.object({ orderId: z.string(), collectionId: z.string() }),
      auth: true,
    },
  );

export default ordersRouter;
