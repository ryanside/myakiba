import { Hono } from "hono";
import type { Variables } from "../..";
import OrdersService from "./service";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { orderInsertSchema, orderUpdateSchema } from "./model";
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

      const totalCount = result.orders.length > 0 ? result.orders[0].totalCount : 0;
      
      return c.json({ 
        orders: result.orders, 
        totalCount,
        pagination: {
          limit: validatedQuery.limit,
          offset: validatedQuery.offset,
          pageCount: Math.ceil(totalCount / validatedQuery.limit)
        }
      });
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
      z.object({ orderIds: z.array(z.string()), newOrder: orderInsertSchema }),
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

      const { data: merged, error } = await tryCatch(
        OrdersService.mergeOrders(
          user.id,
          validatedJSON.orderIds,
          validatedJSON.newOrder
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

        console.error("Error merging orders:", error, {
          userId: user.id,
          orderIds: validatedJSON.orderIds,
          newOrder: validatedJSON.newOrder,
        });

        return c.text("Failed to merge orders", 500);
      }

      return c.json({ merged });
    }
  )
  .post(
    "/split",
    zValidator(
      "json",
      z.object({ orderId: z.string(), newOrder: orderInsertSchema }),
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

      const { data: split, error } = await tryCatch(
        OrdersService.splitOrders(
          user.id,
          validatedJSON.orderId,
          validatedJSON.newOrder
        )
      );

      if (error) {
        if (error.message === "FAILED_TO_INSERT_NEW_ORDER") {
          return c.text("Failed to insert new order", 500);
        }
        if (error.message === "ORDER_ITEMS_NOT_FOUND") {
          return c.text("Order items not found", 404);
        }

        console.error("Error splitting orders:", error, {
          userId: user.id,
          orderId: validatedJSON.orderId,
          newOrder: validatedJSON.newOrder,
        });

        return c.text("Failed to split orders", 500);
      }

      return c.json({ split });
    }
  )
  .put(
    "/:orderId",
    zValidator("param", z.object({ orderId: z.string() }), (result, c) => {
      if (!result.success) {
        return c.text("Invalid order id!", 400);
      }
    }),
    zValidator("json", z.object({ order: orderUpdateSchema }), (result, c) => {
      if (!result.success) {
        return c.text("Invalid request!", 400);
      }
    }),
    async (c) => {
      const user = c.get("user");
      if (!user) return c.text("Unauthorized", 401);

      const validatedJSON = c.req.valid("json");
      const validatedParam = c.req.valid("param");

      const { data: updated, error } = await tryCatch(
        OrdersService.updateOrder(
          user.id,
          validatedParam.orderId,
          validatedJSON.order
        )
      );

      if (error) {
        if (error.message === "ORDER_NOT_FOUND") {
          return c.text("Order not found", 404);
        }
        if (error.message === "ORDER_ITEMS_NOT_FOUND") {
          return c.text("Order items not found", 404);
        }

        console.error("Error updating order:", error, {
          userId: user.id,
          orderId: validatedParam.orderId,
          order: validatedJSON.order,
        });

        return c.text("Failed to update order", 500);
      }

      return c.json({ updated });
    }
  )
  .delete(
    "/:orderId",
    zValidator("param", z.object({ orderId: z.string() }), (result, c) => {
      if (!result.success) {
        return c.text("Invalid order id!", 400);
      }
    }),
    zValidator("json", z.object({ ids: z.array(z.number()) }), (result, c) => {
      if (!result.success) {
        return c.text("Invalid request!", 400);
      }
    }),
    async (c) => {
      const user = c.get("user");
      if (!user) return c.text("Unauthorized", 401);

      const validatedParam = c.req.valid("param");
      const validatedJSON = c.req.valid("json");

      const { data: deleted, error } = await tryCatch(
        OrdersService.deleteItemsFromOrder(
          user.id,
          validatedParam.orderId,
          validatedJSON.ids
        )
      );

      if (error) {
        if (error.message === "ORDER_ITEMS_NOT_FOUND") {
          return c.text("Order items not found", 404);
        }

        console.error("Error deleting items from order:", error, {
          userId: user.id,
          orderId: validatedParam.orderId,
          ids: validatedJSON.ids,
        });

        return c.text("Failed to delete items from order", 500);
      }

      return c.json({ deleted });
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

      const { data: deleted, error } = await tryCatch(
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

      return c.json({ deleted });
    }
  );

export default ordersRouter;
