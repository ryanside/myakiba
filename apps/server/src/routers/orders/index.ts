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
import type { Order, OrderQueryResponse, OrdersQueryResponse } from "@myakiba/types";

const ordersRouter = new Elysia({ prefix: "/orders" })
  .use(betterAuth)
  .get(
    "/",
    async ({ query, user }) => {
      if (!user) return status(401, "Unauthorized");

      const { data: result, error } = await tryCatch(
        OrdersService.getOrders(
          user.id,
          query.limit,
          query.offset,
          query.sort,
          query.order,
          query.search,
          query.shop,
          query.releaseMonthYearStart,
          query.releaseMonthYearEnd,
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
        console.error("Error fetching orders:", error, {
          userId: user.id,
          limit: query.limit,
          offset: query.offset,
          sort: query.sort,
          order: query.order,
        });

        return status(500, "Failed to get orders");
      }

      const totalCount = result.orders.length > 0 ? result.orders[0].totalCount : 0;

      const orders: readonly Order[] = result.orders.map((order) => ({
        ...order,
        createdAt: order.createdAt.toISOString(),
        updatedAt: order.updatedAt.toISOString(),
      }));

      const response: OrdersQueryResponse = {
        orders: [...orders],
        orderStats: result.orderStats,
        totalCount,
        pagination: {
          limit: query.limit,
          offset: query.offset,
          pageCount: Math.ceil(totalCount / query.limit),
        },
      };

      return response;
    },
    { query: ordersQuerySchema, auth: true },
  )
  .get(
    "/ids-and-titles",
    async ({ query, user }) => {
      if (!user) return status(401, "Unauthorized");

      const { data: result, error } = await tryCatch(
        OrdersService.getOrderIdsAndTitles(user.id, query.title),
      );

      if (error) {
        if (error.message === "FAILED_TO_GET_ORDER_IDS_AND_TITLES") {
          return status(500, "Failed to get order ids and titles");
        }
      }

      return { orderIdsAndTitles: result };
    },
    { query: z.object({ title: z.string().optional() }), auth: true },
  )
  .get(
    "/:orderId",
    async ({ params, user }) => {
      if (!user) return status(401, "Unauthorized");

      const { data: order, error } = await tryCatch(
        OrdersService.getOrder(user.id, params.orderId),
      );

      if (error) {
        if (error.message === "ORDER_NOT_FOUND") {
          return status(404, "Order not found");
        }

        console.error("Error fetching order:", error, {
          userId: user.id,
          orderId: params.orderId,
        });

        return status(500, "Failed to get order");
      }

      const serializedOrder: OrderQueryResponse = {
        ...order,
        createdAt: order.createdAt.toISOString(),
        updatedAt: order.updatedAt.toISOString(),
      };

      return { order: serializedOrder };
    },
    { params: orderIdParamSchema, auth: true },
  )
  .post(
    "/merge",
    async ({ body, user }) => {
      if (!user) return status(401, "Unauthorized");

      const { error } = await tryCatch(
        OrdersService.mergeOrders(user.id, body.orderIds, body.newOrder, body.cascadeOptions),
      );

      if (error) {
        if (error.message === "FAILED_TO_INSERT_NEW_ORDER") {
          return status(500, "Failed to insert new order");
        }
        if (error.message === "ORDER_ITEMS_NOT_FOUND") {
          return status(404, "Order items not found");
        }
        if (error.message === "ORDERS_NOT_FOUND") {
          return status(404, "One or more orders not found");
        }
        if (error.message === "FAILED_TO_FETCH_NEW_ORDER") {
          return status(500, "Failed to fetch new order details");
        }

        console.error("Error merging orders:", error, {
          userId: user.id,
          orderIds: body.orderIds,
          newOrder: body.newOrder,
          cascadeOptions: body.cascadeOptions,
        });

        return status(500, "Failed to merge orders");
      }

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
    async ({ body, user }) => {
      if (!user) return status(401, "Unauthorized");

      const { error } = await tryCatch(
        OrdersService.splitOrders(user.id, body.collectionIds, body.newOrder, body.cascadeOptions),
      );

      if (error) {
        if (error.message === "COLLECTION_IDS_REQUIRED") {
          return status(400, "Collection ids are required");
        }
        if (error.message === "FAILED_TO_INSERT_NEW_ORDER") {
          return status(500, "Failed to insert new order");
        }
        if (error.message === "ORDER_ITEMS_NOT_FOUND") {
          return status(404, "Order items not found");
        }

        console.error("Error splitting orders:", error, {
          userId: user.id,
          collectionIds: body.collectionIds,
          newOrder: body.newOrder,
          cascadeOptions: body.cascadeOptions,
        });

        return status(500, "Failed to split orders");
      }

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
    async ({ body, user }) => {
      if (!user) return status(401, "Unauthorized");

      const { error } = await tryCatch(
        OrdersService.moveItems(user.id, body.targetOrderId, body.collectionIds, body.orderIds),
      );

      if (error) {
        if (error.message === "FAILED_TO_MOVE_ITEMS") {
          return status(500, "Failed to move items");
        }
      }

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
    async ({ params, body, user }) => {
      if (!user) return status(401, "Unauthorized");

      const { error } = await tryCatch(
        OrdersService.updateOrder(user.id, params.orderId, body.order, body.cascadeOptions),
      );

      if (error) {
        if (error.message === "ORDER_NOT_FOUND") {
          return status(404, "Order not found");
        }

        console.error("Error updating order:", error, {
          userId: user.id,
          orderId: params.orderId,
          order: body.order,
          cascadeOptions: body.cascadeOptions,
        });

        return status(500, "Failed to update order");
      }

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
    async ({ body, user }) => {
      if (!user) return status(401, "Unauthorized");

      const { error } = await tryCatch(OrdersService.deleteOrders(user.id, body.orderIds));

      if (error) {
        if (error.message === "ORDERS_ITEMS_NOT_FOUND") {
          return status(404, "One or more orders items not found");
        }

        if (error.message === "ORDERS_NOT_FOUND") {
          return status(404, "One or more orders not found");
        }

        console.error("Error deleting orders:", error, {
          userId: user.id,
          orderIds: body.orderIds,
        });

        return status(500, "Failed to delete orders");
      }

      return "Orders deleted successfully";
    },
    {
      body: z.object({ orderIds: z.array(z.string()) }),
      auth: true,
    },
  )
  .delete(
    "/items",
    async ({ body, user }) => {
      if (!user) return status(401, "Unauthorized");

      const { error } = await tryCatch(OrdersService.deleteOrderItems(user.id, body.collectionIds));

      if (error) {
        if (error.message === "ORDER_ITEMS_NOT_FOUND") {
          return status(404, "One or more order items not found");
        }

        console.error("Error deleting order items:", error, {
          userId: user.id,
          collectionIds: body.collectionIds,
        });

        return status(500, "Failed to delete order items");
      }

      return "Order items deleted successfully";
    },
    {
      body: z.object({ collectionIds: z.array(z.string()) }),
      auth: true,
    },
  )
  .delete(
    "/:orderId/items/:collectionId",
    async ({ params, user }) => {
      if (!user) return status(401, "Unauthorized");

      const { error } = await tryCatch(
        OrdersService.deleteOrderItem(user.id, params.orderId, params.collectionId),
      );

      if (error) {
        if (error.message === "ORDER_ITEM_NOT_FOUND") {
          return status(404, "Order item not found");
        }

        console.error("Error deleting order item:", error, {
          userId: user.id,
          orderId: params.orderId,
          collectionId: params.collectionId,
        });

        return status(500, "Failed to delete order item");
      }

      return "Order item deleted successfully";
    },
    {
      params: z.object({ orderId: z.string(), collectionId: z.string() }),
      auth: true,
    },
  );

export default ordersRouter;
