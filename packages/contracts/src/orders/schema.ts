import * as z from "zod";
import { ORDER_STATUSES, SHIPPING_METHODS } from "../shared/constants";
import { ORDER_CASCADE_OPTIONS } from "./constants";
import { syncOrderSchema } from "../sync/schema";
import { orderSearchSortSchema, sortDirectionSchema } from "../search/schema";

export const orderFiltersSchema = z.object({
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().min(0).optional(),
  sort: orderSearchSortSchema.optional(),
  order: sortDirectionSchema.optional(),
  search: z.string().optional(),
  shop: z.array(z.string()).optional(),
  releaseDateStart: z.iso.date().optional(),
  releaseDateEnd: z.iso.date().optional(),
  shipMethod: z.array(z.enum(SHIPPING_METHODS)).optional(),
  orderDateStart: z.iso.date().optional(),
  orderDateEnd: z.iso.date().optional(),
  payDateStart: z.iso.date().optional(),
  payDateEnd: z.iso.date().optional(),
  shipDateStart: z.iso.date().optional(),
  shipDateEnd: z.iso.date().optional(),
  colDateStart: z.iso.date().optional(),
  colDateEnd: z.iso.date().optional(),
  status: z.array(z.enum(ORDER_STATUSES)).optional(),
  totalMin: z.coerce.number().int().optional(),
  totalMax: z.coerce.number().int().optional(),
  shippingFeeMin: z.coerce.number().int().optional(),
  shippingFeeMax: z.coerce.number().int().optional(),
  taxesMin: z.coerce.number().int().optional(),
  taxesMax: z.coerce.number().int().optional(),
  dutiesMin: z.coerce.number().int().optional(),
  dutiesMax: z.coerce.number().int().optional(),
  tariffsMin: z.coerce.number().int().optional(),
  tariffsMax: z.coerce.number().int().optional(),
  miscFeesMin: z.coerce.number().int().optional(),
  miscFeesMax: z.coerce.number().int().optional(),
});

export const searchSchema = orderFiltersSchema;

export const newOrderSchema = syncOrderSchema.omit({
  id: true,
  userId: true,
});

export const editedOrderSchema = newOrderSchema.extend({
  orderId: z.string(),
});

export const cascadeOptionSchema = z.enum(ORDER_CASCADE_OPTIONS);
export const cascadeOptionsSchema = z.array(cascadeOptionSchema);

export type OrderFilters = z.infer<typeof orderFiltersSchema>;
export type NewOrder = z.infer<typeof newOrderSchema>;
export type EditedOrder = z.infer<typeof editedOrderSchema>;
export type CascadeOption = z.infer<typeof cascadeOptionSchema>;
export type CascadeOptions = z.infer<typeof cascadeOptionsSchema>;
