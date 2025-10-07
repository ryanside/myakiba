import { Hono } from "hono";
import type { Variables } from "../..";
import OrdersService from "./service";
import { zValidator } from "@hono/zod-validator";
import * as z from "zod";
import {
  orderInsertSchema,
  orderItemUpdateSchema,
  orderUpdateSchema,
} from "./model";
import { tryCatch } from "@/lib/utils";

const ordersRouter = new Hono<{ Variables: Variables }>()
  .get(
    "/",
    zValidator(
      "query",
      z.object({
        limit: z.coerce.number().optional().default(10),
        offset: z.coerce.number().optional().default(0),
        sort: z
          .enum([
            "title",
            "shop",
            "orderDate",
            "releaseMonthYear",
            "shippingMethod",
            "total",
            "itemCount",
            "createdAt",
          ])
          .optional()
          .default("createdAt"),
        order: z.enum(["asc", "desc"]).optional().default("desc"),
        search: z.string().optional(),
      }),
      (result, c) => {
        if (!result.success) {
          console.log(result.error);
          return c.text("Invalid request!", 400);
        }
      }
    ),
    async (c) => {
      const user = c.get("user");
      if (!user) return c.text("Unauthorized", 401);

      const validatedQuery = c.req.valid("query");

      const { data: result, error } = await tryCatch(
        OrdersService.getOrders(
          user.id,
          validatedQuery.limit,
          validatedQuery.offset,
          validatedQuery.sort,
          validatedQuery.order,
          validatedQuery.search
        )
      );

      if (error) {
        console.error("Error fetching orders:", error, {
          userId: user.id,
          limit: validatedQuery.limit,
          offset: validatedQuery.offset,
          sort: validatedQuery.sort,
          order: validatedQuery.order,
        });

        return c.text("Failed to get orders", 500);
      }

      const totalCount =
        result.orders.length > 0 ? result.orders[0].totalCount : 0;

      return c.json({
        orders: result.orders,
        totalCount,
        pagination: {
          limit: validatedQuery.limit,
          offset: validatedQuery.offset,
          pageCount: Math.ceil(totalCount / validatedQuery.limit),
        },
      });
    }
  )
  .get(
    "/ids-and-titles",
    zValidator(
      "query",
      z.object({ title: z.string().optional() }),
      (result, c) => {
        if (!result.success) {
          return c.text("Invalid request!", 400);
        }
      }
    ),
    async (c) => {
      const user = c.get("user");
      if (!user) return c.text("Unauthorized", 401);

      const validatedQuery = c.req.valid("query");

      const { data: result, error } = await tryCatch(
        OrdersService.getOrderIdsAndTitles(user.id, validatedQuery.title)
      );

      if (error) {
        if (error.message === "FAILED_TO_GET_ORDER_IDS_AND_TITLES") {
          return c.text("Failed to get order ids and titles", 500);
        }
      }

      return c.json({ orderIdsAndTitles: result });
    }
  )
  .get(
    "/:orderId",
    zValidator("param", z.object({ orderId: z.string() }), (result, c) => {
      if (!result.success) {
        console.log(result.error);
        return c.text("Invalid request param!", 400);
      }
    }),
    async (c) => {
      const user = c.get("user");
      if (!user) return c.text("Unauthorized", 401);

      const validatedParam = c.req.valid("param");

      const { data: order, error } = await tryCatch(
        OrdersService.getOrder(user.id, validatedParam.orderId)
      );

      if (error) {
        if (error.message === "ORDER_NOT_FOUND") {
          return c.text("Order not found", 404);
        }

        console.error("Error fetching order:", error, {
          userId: user.id,
          orderId: validatedParam.orderId,
        });

        return c.text("Failed to get order", 500);
      }

      return c.json({ order });
    }
  )
  .post(
    "/merge",
    zValidator(
      "json",
      z.object({
        orderIds: z.array(z.string()),
        newOrder: orderInsertSchema.omit({ userId: true }),
        cascadeOptions: z.array(z.string()),
      }),
      (result, c) => {
        if (!result.success) {
          return c.text("Invalid request!", 400);
        }
      }
    ),
    async (c) => {
      const user = c.get("user");
      if (!user) return c.text("Unauthorized", 401);

      const validatedJSON = c.req.valid("json");

      const { error } = await tryCatch(
        OrdersService.mergeOrders(
          user.id,
          validatedJSON.orderIds,
          validatedJSON.newOrder,
          validatedJSON.cascadeOptions
        )
      );

      if (error) {
        if (error.message === "FAILED_TO_INSERT_NEW_ORDER") {
          return c.text("Failed to insert new order", 500);
        }
        if (error.message === "ORDER_ITEMS_NOT_FOUND") {
          return c.text("Order items not found", 404);
        }
        if (error.message === "ORDERS_NOT_FOUND") {
          return c.text("One or more orders not found", 404);
        }
        if (error.message === "FAILED_TO_FETCH_NEW_ORDER") {
          return c.text("Failed to fetch new order details", 500);
        }

        console.error("Error merging orders:", error, {
          userId: user.id,
          orderIds: validatedJSON.orderIds,
          newOrder: validatedJSON.newOrder,
          cascadeOptions: validatedJSON.cascadeOptions,
        });

        return c.text("Failed to merge orders", 500);
      }

      return c.text("Orders merged successfully");
    }
  )
  .post(
    "/split",
    zValidator(
      "json",
      z.object({
        collectionIds: z.array(z.string()),
        newOrder: orderInsertSchema.omit({ userId: true }),
        cascadeOptions: z.array(z.string()),
      }),
      (result, c) => {
        if (!result.success) {
          return c.text("Invalid request!", 400);
        }
      }
    ),
    async (c) => {
      const user = c.get("user");
      if (!user) return c.text("Unauthorized", 401);

      const validatedJSON = c.req.valid("json");

      const { error } = await tryCatch(
        OrdersService.splitOrders(
          user.id,
          validatedJSON.collectionIds,
          validatedJSON.newOrder,
          validatedJSON.cascadeOptions
        )
      );

      if (error) {
        if (error.message === "COLLECTION_IDS_REQUIRED") {
          return c.text("Collection ids are required", 400);
        }
        if (error.message === "FAILED_TO_INSERT_NEW_ORDER") {
          return c.text("Failed to insert new order", 500);
        }
        if (error.message === "ORDER_ITEMS_NOT_FOUND") {
          return c.text("Order items not found", 404);
        }

        console.error("Error splitting orders:", error, {
          userId: user.id,
          collectionIds: validatedJSON.collectionIds,
          newOrder: validatedJSON.newOrder,
          cascadeOptions: validatedJSON.cascadeOptions,
        });

        return c.text("Failed to split orders", 500);
      }

      return c.text("Items split successfully");
    }
  )
  .put(
    "/:orderId/items/:collectionId",
    zValidator(
      "param",
      z.object({ orderId: z.string(), collectionId: z.string() }),
      (result, c) => {
        if (!result.success) {
          return c.text("Invalid request param!", 400);
        }
      }
    ),

    zValidator(
      "json",
      z.object({
        item: orderItemUpdateSchema,
      }),
      (result, c) => {
        if (!result.success) {
          return c.text("Invalid request!", 400);
        }
      }
    ),
    async (c) => {
      const user = c.get("user");
      if (!user) return c.text("Unauthorized", 401);

      const validatedJSON = c.req.valid("json");
      const validatedParam = c.req.valid("param");

      const { error } = await tryCatch(
        OrdersService.updateOrderItem(
          user.id,
          validatedParam.orderId,
          validatedParam.collectionId,
          validatedJSON.item
        )
      );

      if (error) {
        if (error.message === "ORDER_ITEM_NOT_FOUND") {
          return c.text("Order item not found", 404);
        }
      }

      return c.text("Order item updated successfully");
    }
  )
  .put(
    "/:orderId",
    zValidator("param", z.object({ orderId: z.string() }), (result, c) => {
      if (!result.success) {
        return c.text("Invalid order id!", 400);
      }
    }),
    zValidator(
      "json",
      z.object({
        order: orderUpdateSchema,
        cascadeOptions: z.array(z.string()),
      }),
      (result, c) => {
        if (!result.success) {
          console.log(result.error);
          return c.text("Invalid request!", 400);
        }
      }
    ),
    async (c) => {
      const user = c.get("user");
      if (!user) return c.text("Unauthorized", 401);

      const validatedJSON = c.req.valid("json");
      const validatedParam = c.req.valid("param");

      const { error } = await tryCatch(
        OrdersService.updateOrder(
          user.id,
          validatedParam.orderId,
          validatedJSON.order,
          validatedJSON.cascadeOptions
        )
      );

      if (error) {
        if (error.message === "ORDER_NOT_FOUND") {
          return c.text("Order not found", 404);
        }

        console.error("Error updating order:", error, {
          userId: user.id,
          orderId: validatedParam.orderId,
          order: validatedJSON.order,
          cascadeOptions: validatedJSON.cascadeOptions,
        });

        return c.text("Failed to update order", 500);
      }

      return c.text("Order updated successfully");
    }
  )
  .put(
    "/move-items",
    zValidator(
      "json",
      z.object({
        targetOrderId: z.string(),
        collectionIds: z.array(z.string()),
        orderIds: z.array(z.string()),
      }),
      (result, c) => {
        if (!result.success) {
          return c.text("Invalid request!", 400);
        }
      }
    ),
    async (c) => {
      const user = c.get("user");
      if (!user) return c.text("Unauthorized", 401);

      const validatedJSON = c.req.valid("json");

      const { error } = await tryCatch(
        OrdersService.moveItems(
          user.id,
          validatedJSON.targetOrderId,
          validatedJSON.collectionIds,
          validatedJSON.orderIds
        )
      );

      if (error) {
        if (error.message === "FAILED_TO_MOVE_ITEMS") {
          return c.text("Failed to move items", 500);
        }
      }

      return c.text("Items moved successfully");
    }
  )
  .delete(
    "/",
    zValidator(
      "json",
      z.object({ orderIds: z.array(z.string()) }),
      (result, c) => {
        if (!result.success) {
          return c.text("Invalid request!", 400);
        }
      }
    ),
    async (c) => {
      const user = c.get("user");
      if (!user) return c.text("Unauthorized", 401);

      const validatedJSON = c.req.valid("json");

      const { error } = await tryCatch(
        OrdersService.deleteOrders(user.id, validatedJSON.orderIds)
      );

      if (error) {
        if (error.message === "ORDERS_ITEMS_NOT_FOUND") {
          return c.text("One or more orders items not found", 404);
        }

        if (error.message === "ORDERS_NOT_FOUND") {
          return c.text("One or more orders not found", 404);
        }

        console.error("Error deleting orders:", error, {
          userId: user.id,
          orderIds: validatedJSON.orderIds,
        });

        return c.text("Failed to delete orders", 500);
      }

      return c.text("Orders deleted successfully");
    }
  )
  .delete(
    "/:orderId/items/:collectionId",
    zValidator(
      "param",
      z.object({ orderId: z.string(), collectionId: z.string() }),
      (result, c) => {
        if (!result.success) {
          return c.text("Invalid order id!", 400);
        }
      }
    ),
    async (c) => {
      const user = c.get("user");
      if (!user) return c.text("Unauthorized", 401);

      const validatedParam = c.req.valid("param");

      const { error } = await tryCatch(
        OrdersService.deleteOrderItem(
          user.id,
          validatedParam.orderId,
          validatedParam.collectionId
        )
      );

      if (error) {
        if (error.message === "ORDER_ITEM_NOT_FOUND") {
          return c.text("Order item not found", 404);
        }

        console.error("Error deleting order item:", error, {
          userId: user.id,
          orderId: validatedParam.orderId,
          collectionId: validatedParam.collectionId,
        });

        return c.text("Failed to delete order item", 500);
      }

      return c.text("Order item deleted successfully");
    }
  );

export default ordersRouter;
