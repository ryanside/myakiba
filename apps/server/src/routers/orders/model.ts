import * as z from "zod";
import { createUpdateSchema } from "drizzle-zod";
import { order } from "@myakiba/db/schema/figure";
import { ORDER_STATUSES, SHIPPING_METHODS } from "@myakiba/contracts/shared/constants";
import {
  createCommaSeparatedEnumArraySchema,
  commaSeparatedStringArraySchema,
} from "@myakiba/contracts/search/query-params";
import { searchSchema } from "@myakiba/contracts/orders/schema";
import { orderSearchSortSchema } from "@myakiba/contracts/search/schema";
import { pageFields } from "@myakiba/contracts/shared/pagination";
import { WRITE_LIMITS } from "@myakiba/contracts/shared/write-limits";

const commaSeparatedShipMethodArray = createCommaSeparatedEnumArraySchema(SHIPPING_METHODS);
const commaSeparatedStatusArray = createCommaSeparatedEnumArraySchema(ORDER_STATUSES);

export const ordersQuerySchema = searchSchema.extend({
  ...pageFields(orderSearchSortSchema, "createdAt"),
  shop: commaSeparatedStringArraySchema,
  shipMethod: commaSeparatedShipMethodArray,
  status: commaSeparatedStatusArray,
});

export const orderUpdateSchema = createUpdateSchema(order)
  .omit({
    id: true,
    userId: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    title: z.string().max(WRITE_LIMITS.title).optional(),
    shop: z.string().trim().max(WRITE_LIMITS.shop).optional(),
    notes: z.string().max(WRITE_LIMITS.notes).optional(),
  });

export const orderIdParamSchema = z.object({ orderId: z.string().max(WRITE_LIMITS.id) });

export type OrdersQuery = z.infer<typeof ordersQuerySchema>;
export type OrderUpdateType = z.infer<typeof orderUpdateSchema>;
