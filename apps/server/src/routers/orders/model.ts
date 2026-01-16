import * as z from "zod";
import { createInsertSchema, createUpdateSchema } from "drizzle-zod";
import { order } from "@myakiba/db/schema/figure";
import { ORDER_STATUSES, SHIPPING_METHODS } from "@myakiba/constants";

const commaSeparatedStringArray = z.preprocess((val) => {
  if (typeof val === "string" && val.length > 0) {
    return val.split(",");
  }
  return undefined;
}, z.array(z.string()).optional());

const commaSeparatedShipMethodArray = z.preprocess(
  (val) => {
    if (typeof val === "string" && val.length > 0) {
      return val.split(",");
    }
    return undefined;
  },
  z.array(z.enum(SHIPPING_METHODS)).optional()
);

const commaSeparatedStatusArray = z.preprocess(
  (val) => {
    if (typeof val === "string" && val.length > 0) {
      return val.split(",");
    }
    return undefined;
  },
  z.array(z.enum(ORDER_STATUSES)).optional()
);

export const ordersQuerySchema = z.object({
  limit: z.coerce.number().optional().default(10),
  offset: z.coerce.number().optional().default(0),
  sort: z
    .enum([
      "title",
      "shop",
      "orderDate",
      "paymentDate",
      "shippingDate",
      "collectionDate",
      "releaseMonthYear",
      "shippingMethod",
      "total",
      "shippingFee",
      "taxes",
      "duties",
      "tariffs",
      "miscFees",
      "itemCount",
      "status",
      "createdAt",
    ])
    .optional()
    .default("createdAt"),
  order: z.enum(["asc", "desc"]).optional().default("desc"),
  search: z.string().optional(),
  shop: commaSeparatedStringArray,
  releaseMonthYearStart: z.string().optional(),
  releaseMonthYearEnd: z.string().optional(),
  shipMethod: commaSeparatedShipMethodArray,
  orderDateStart: z.string().optional(),
  orderDateEnd: z.string().optional(),
  payDateStart: z.string().optional(),
  payDateEnd: z.string().optional(),
  shipDateStart: z.string().optional(),
  shipDateEnd: z.string().optional(),
  colDateStart: z.string().optional(),
  colDateEnd: z.string().optional(),
  status: commaSeparatedStatusArray,
  totalMin: z.string().optional(),
  totalMax: z.string().optional(),
  shippingFeeMin: z.string().optional(),
  shippingFeeMax: z.string().optional(),
  taxesMin: z.string().optional(),
  taxesMax: z.string().optional(),
  dutiesMin: z.string().optional(),
  dutiesMax: z.string().optional(),
  tariffsMin: z.string().optional(),
  tariffsMax: z.string().optional(),
  miscFeesMin: z.string().optional(),
  miscFeesMax: z.string().optional(),
});

export const orderInsertSchema = createInsertSchema(order);
export const orderUpdateSchema = createUpdateSchema(order);

export type orderInsertType = z.infer<typeof orderInsertSchema>;
export type orderUpdateType = z.infer<typeof orderUpdateSchema>;
