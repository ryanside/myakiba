import * as z from "zod";
import { ORDER_STATUSES, SHIPPING_METHODS } from "@myakiba/contracts/shared/constants";
import {
  createCommaSeparatedEnumArraySchema,
  commaSeparatedStringArraySchema,
} from "@myakiba/contracts/search/query-params";
import { searchSchema } from "@myakiba/contracts/orders/schema";
import { orderSearchSortSchema } from "@myakiba/contracts/search/schema";
import { pageFields } from "@myakiba/contracts/shared/pagination";
import { idListSchema, WRITE_LIMITS } from "@myakiba/contracts/shared/write-limits";

const commaSeparatedShipMethodArray = createCommaSeparatedEnumArraySchema(SHIPPING_METHODS);
const commaSeparatedStatusArray = createCommaSeparatedEnumArraySchema(ORDER_STATUSES);

export const ordersQuerySchema = searchSchema
  .extend({
    ...pageFields(orderSearchSortSchema, "createdAt"),
    shop: commaSeparatedStringArraySchema,
    shipMethod: commaSeparatedShipMethodArray,
    status: commaSeparatedStatusArray,
    paid: z.stringbool().optional(),
    overdue: z.stringbool().optional(),
    today: z.iso.date().optional(),
  })
  .refine(({ overdue, today }) => overdue !== true || today !== undefined, {
    message: "Overdue needs today's date",
    path: ["today"],
  });

export const orderIdParamSchema = z.object({ orderId: z.string().max(WRITE_LIMITS.id) });

export const mergeDraftBodySchema = z.strictObject({ orderIds: idListSchema });

export const newOrderDraftBodySchema = z.strictObject({ collectionIds: idListSchema });

export type OrdersQuery = z.infer<typeof ordersQuerySchema>;
