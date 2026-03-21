import * as z from "zod";
import { createInsertSchema, createUpdateSchema } from "drizzle-zod";
import { order } from "@myakiba/db/schema/figure";
import { ORDER_STATUSES, SHIPPING_METHODS } from "@myakiba/contracts/shared/constants";
import {
  createCommaSeparatedEnumArraySchema,
  commaSeparatedStringArraySchema,
} from "@myakiba/contracts/search/query-params";
import { searchSchema } from "@myakiba/contracts/orders/schema";
import { orderSearchSortSchema, sortDirectionSchema } from "@myakiba/contracts/search/schema";

const commaSeparatedShipMethodArray = createCommaSeparatedEnumArraySchema(SHIPPING_METHODS);
const commaSeparatedStatusArray = createCommaSeparatedEnumArraySchema(ORDER_STATUSES);

export const ordersQuerySchema = searchSchema.extend({
  limit: z.coerce.number().optional().default(10),
  offset: z.coerce.number().optional().default(0),
  sort: orderSearchSortSchema.optional().default("createdAt"),
  order: sortDirectionSchema.optional().default("desc"),
  shop: commaSeparatedStringArraySchema,
  shipMethod: commaSeparatedShipMethodArray,
  status: commaSeparatedStatusArray,
});

export const orderInsertSchema = createInsertSchema(order);
export const orderUpdateSchema = createUpdateSchema(order);

export const orderIdParamSchema = z.object({ orderId: z.string() });

export const orderItemsQuerySchema = z.object({
  limit: z.coerce.number().optional().default(5),
  offset: z.coerce.number().optional().default(0),
});

export type OrderInsertType = z.infer<typeof orderInsertSchema>;
export type OrderUpdateType = z.infer<typeof orderUpdateSchema>;
