import * as z from "zod";
import { createInsertSchema, createUpdateSchema } from "drizzle-zod";
import { order } from "@myakiba/db/schema/figure";
import { ORDER_STATUSES, SHIPPING_METHODS } from "@myakiba/contracts/shared/constants";
import {
  createCommaSeparatedEnumArraySchema,
  commaSeparatedStringArraySchema,
} from "@myakiba/contracts/search/query-params";
import { searchSchema } from "@myakiba/contracts/orders/schema";
import { orderSearchSortSchema } from "@myakiba/contracts/search/schema";
import { pageFields } from "@myakiba/contracts/shared/pagination";

const commaSeparatedShipMethodArray = createCommaSeparatedEnumArraySchema(SHIPPING_METHODS);
const commaSeparatedStatusArray = createCommaSeparatedEnumArraySchema(ORDER_STATUSES);

export const ordersQuerySchema = searchSchema.extend({
  ...pageFields(orderSearchSortSchema, "createdAt"),
  shop: commaSeparatedStringArraySchema,
  shipMethod: commaSeparatedShipMethodArray,
  status: commaSeparatedStatusArray,
});

const orderInsertSchema = createInsertSchema(order).extend({
  shop: z.string().trim(),
});
export const orderUpdateSchema = createUpdateSchema(order)
  .omit({
    id: true,
    userId: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    shop: z.string().trim().optional(),
  });

export const orderIdParamSchema = z.object({ orderId: z.string() });

export type OrdersQuery = z.infer<typeof ordersQuerySchema>;
export type OrderInsertType = z.infer<typeof orderInsertSchema>;
export type OrderUpdateType = z.infer<typeof orderUpdateSchema>;
