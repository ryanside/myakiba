import { Elysia, status } from "elysia";
import OrdersService from "./service";
import * as z from "zod";
import {
  orderInsertSchema,
  orderUpdateSchema,
  ordersQuerySchema,
  orderIdParamSchema,
} from "./model";
import { tryCatch } from "@myakiba/utils";
import { betterAuth } from "@/middleware/better-auth";
import { requestContext } from "@/middleware/request-context";
import type { Order, OrderQueryResponse } from "@myakiba/types";

const ordersRouter = new Elysia({ prefix: "/orders" })
  .use(betterAuth)
  .use(requestContext)
  .get(
    "/",
    async ({ query, user, wideEvent }) => {
      if (!user) return status(401, "Unauthorized");

      wideEvent.set({ userId: user.id });

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
        wideEvent.set({ error, outcome: "error" });
        return status(500, "Failed to get orders");
      }

      const orders: readonly Order[] = result.map((order) => ({
        ...order,
        createdAt: order.createdAt.toISOString(),
        updatedAt: order.updatedAt.toISOString(),
      }));

      wideEvent.set({ resultCount: orders.length, outcome: "success" });
      return [...orders];
    },
    { query: ordersQuerySchema, auth: true },
  )
  .get(
    "/ids-and-titles",
    async ({ query, user, wideEvent }) => {
      if (!user) return status(401, "Unauthorized");

      wideEvent.set({ userId: user.id });

      const { data: result, error } = await tryCatch(
        OrdersService.getOrderIdsAndTitles(user.id, query.title),
      );

      if (error) {
        wideEvent.set({ error, outcome: "error" });
        return status(500, "Failed to get order ids and titles");
      }

      wideEvent.set({ outcome: "success" });
      return { orderIdsAndTitles: result };
    },
    { query: z.object({ title: z.string().optional() }), auth: true },
  )
  .get(
    "/:orderId",
    async ({ params, user, wideEvent }) => {
      if (!user) return status(401, "Unauthorized");

      wideEvent.set({ userId: user.id, orderId: params.orderId });

      const { data: order, error } = await tryCatch(
        OrdersService.getOrder(user.id, params.orderId),
      );

      if (error) {
        if (error.message === "ORDER_NOT_FOUND") {
          wideEvent.set({ outcome: "not_found" });
          return status(404, "Order not found");
        }

        wideEvent.set({ error, outcome: "error" });
        return status(500, "Failed to get order");
      }

      const serializedOrder: OrderQueryResponse = {
        ...order,
        createdAt: order.createdAt.toISOString(),
        updatedAt: order.updatedAt.toISOString(),
      };

      wideEvent.set({ outcome: "success" });
      return { order: serializedOrder };
    },
    { params: orderIdParamSchema, auth: true },
  )
  .post(
    "/merge",
    async ({ body, user, wideEvent }) => {
      if (!user) return status(401, "Unauthorized");

      wideEvent.set({ userId: user.id, orderCount: body.orderIds.length });

      const { error } = await tryCatch(
        OrdersService.mergeOrders(user.id, body.orderIds, body.newOrder, body.cascadeOptions),
      );

      if (error) {
        if (error.message === "FAILED_TO_INSERT_NEW_ORDER") {
          wideEvent.set({ error, outcome: "error" });
          return status(500, "Failed to insert new order");
        }
        if (error.message === "ORDER_ITEMS_NOT_FOUND") {
          wideEvent.set({ outcome: "not_found" });
          return status(404, "Order items not found");
        }
        if (error.message === "ORDERS_NOT_FOUND") {
          wideEvent.set({ outcome: "not_found" });
          return status(404, "One or more orders not found");
        }
        if (error.message === "FAILED_TO_FETCH_NEW_ORDER") {
          wideEvent.set({ error, outcome: "error" });
          return status(500, "Failed to fetch new order details");
        }

        wideEvent.set({ error, outcome: "error" });
        return status(500, "Failed to merge orders");
      }

      wideEvent.set({ outcome: "success" });
      return "Orders merged successfully";
    },
    {
      body: z.object({
        orderIds: z.array(z.string()),
        newOrder: orderInsertSchema.omit({ userId: true }),
        cascadeOptions: z.array(z.string()),
      }),
      auth: true,
    },
  )
  .post(
    "/split",
    async ({ body, user, wideEvent }) => {
      if (!user) return status(401, "Unauthorized");

      wideEvent.set({ userId: user.id, itemCount: body.collectionIds.length });

      const { error } = await tryCatch(
        OrdersService.splitOrders(user.id, body.collectionIds, body.newOrder, body.cascadeOptions),
      );

      if (error) {
        if (error.message === "COLLECTION_IDS_REQUIRED") {
          wideEvent.set({ outcome: "bad_request" });
          return status(400, "Collection ids are required");
        }
        if (error.message === "FAILED_TO_INSERT_NEW_ORDER") {
          wideEvent.set({ error, outcome: "error" });
          return status(500, "Failed to insert new order");
        }
        if (error.message === "ORDER_ITEMS_NOT_FOUND") {
          wideEvent.set({ outcome: "not_found" });
          return status(404, "Order items not found");
        }

        wideEvent.set({ error, outcome: "error" });
        return status(500, "Failed to split orders");
      }

      wideEvent.set({ outcome: "success" });
      return "Items split successfully";
    },
    {
      body: z.object({
        collectionIds: z.array(z.string()),
        newOrder: orderInsertSchema.omit({ userId: true }),
        cascadeOptions: z.array(z.string()),
      }),
      auth: true,
    },
  )
  .put(
    "/move-items",
    async ({ body, user, wideEvent }) => {
      if (!user) return status(401, "Unauthorized");

      wideEvent.set({ userId: user.id, itemCount: body.collectionIds.length });

      const { error } = await tryCatch(
        OrdersService.moveItems(user.id, body.targetOrderId, body.collectionIds, body.orderIds),
      );

      if (error) {
        wideEvent.set({ error, outcome: "error" });
        return status(500, "Failed to move items");
      }

      wideEvent.set({ outcome: "success" });
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
    async ({ params, body, user, wideEvent }) => {
      if (!user) return status(401, "Unauthorized");

      wideEvent.set({ userId: user.id, orderId: params.orderId });

      const { error } = await tryCatch(
        OrdersService.updateOrder(user.id, params.orderId, body.order, body.cascadeOptions),
      );

      if (error) {
        if (error.message === "ORDER_NOT_FOUND") {
          wideEvent.set({ outcome: "not_found" });
          return status(404, "Order not found");
        }

        wideEvent.set({ error, outcome: "error" });
        return status(500, "Failed to update order");
      }

      wideEvent.set({ outcome: "success" });
      return "Order updated successfully";
    },
    {
      params: orderIdParamSchema,
      body: z.object({
        order: orderUpdateSchema,
        cascadeOptions: z.array(z.string()),
      }),
      auth: true,
    },
  )
  .delete(
    "/",
    async ({ body, user, wideEvent }) => {
      if (!user) return status(401, "Unauthorized");

      wideEvent.set({ userId: user.id, orderCount: body.orderIds.length });

      const { error } = await tryCatch(OrdersService.deleteOrders(user.id, body.orderIds));

      if (error) {
        if (error.message === "ORDERS_ITEMS_NOT_FOUND") {
          wideEvent.set({ outcome: "not_found" });
          return status(404, "One or more orders items not found");
        }

        if (error.message === "ORDERS_NOT_FOUND") {
          wideEvent.set({ outcome: "not_found" });
          return status(404, "One or more orders not found");
        }

        wideEvent.set({ error, outcome: "error" });
        return status(500, "Failed to delete orders");
      }

      wideEvent.set({ outcome: "success" });
      return "Orders deleted successfully";
    },
    {
      body: z.object({ orderIds: z.array(z.string()) }),
      auth: true,
    },
  )
  .delete(
    "/items",
    async ({ body, user, wideEvent }) => {
      if (!user) return status(401, "Unauthorized");

      wideEvent.set({ userId: user.id, itemCount: body.collectionIds.length });

      const { error } = await tryCatch(OrdersService.deleteOrderItems(user.id, body.collectionIds));

      if (error) {
        if (error.message === "ORDER_ITEMS_NOT_FOUND") {
          wideEvent.set({ outcome: "not_found" });
          return status(404, "One or more order items not found");
        }

        wideEvent.set({ error, outcome: "error" });
        return status(500, "Failed to delete order items");
      }

      wideEvent.set({ outcome: "success" });
      return "Order items deleted successfully";
    },
    {
      body: z.object({ collectionIds: z.array(z.string()) }),
      auth: true,
    },
  )
  .delete(
    "/:orderId/items/:collectionId",
    async ({ params, user, wideEvent }) => {
      if (!user) return status(401, "Unauthorized");

      wideEvent.set({
        userId: user.id,
        orderId: params.orderId,
        collectionId: params.collectionId,
      });

      const { error } = await tryCatch(
        OrdersService.deleteOrderItem(user.id, params.orderId, params.collectionId),
      );

      if (error) {
        if (error.message === "ORDER_ITEM_NOT_FOUND") {
          wideEvent.set({ outcome: "not_found" });
          return status(404, "Order item not found");
        }

        wideEvent.set({ error, outcome: "error" });
        return status(500, "Failed to delete order item");
      }

      wideEvent.set({ outcome: "success" });
      return "Order item deleted successfully";
    },
    {
      params: z.object({ orderId: z.string(), collectionId: z.string() }),
      auth: true,
    },
  );

export default ordersRouter;
