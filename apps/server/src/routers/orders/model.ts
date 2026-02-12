import * as z from "zod";
import { createInsertSchema, createUpdateSchema } from "drizzle-zod";
import { order } from "@myakiba/db/schema/figure";
import { ORDER_STATUSES, SHIPPING_METHODS } from "@myakiba/constants";
import {
  createCommaSeparatedEnumArraySchema,
  commaSeparatedStringArraySchema,
  orderSearchSortSchema,
  searchSchema,
  sortDirectionSchema,
} from "@myakiba/schemas";

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

export type OrderInsertType = z.infer<typeof orderInsertSchema>;
export type OrderUpdateType = z.infer<typeof orderUpdateSchema>;
