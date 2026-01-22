import * as z from "zod";
import { createInsertSchema } from "drizzle-zod";
import { collection, order } from "@myakiba/db/schema/figure";
import { ORDER_STATUSES, CONDITIONS, SHIPPING_METHODS } from "@myakiba/constants";

export const csvItemSchema = z.object({
  itemExternalId: z.int(),
  status: z.enum(["Owned", "Ordered"]),
  count: z.int(),
  score: z.string(),
  payment_date: z.string().nullable(),
  shipping_date: z.string().nullable(),
  collecting_date: z.string().nullable(),
  price: z.string(),
  shop: z.string(),
  shipping_method: z.enum(SHIPPING_METHODS),
  note: z.string(),
  orderId: z.string().nullable(),
  orderDate: z.string().nullable(),
});

export type csvItem = z.infer<typeof csvItemSchema>;

export const orderInsertSchema = createInsertSchema(order);

export type orderInsertType = z.infer<typeof orderInsertSchema>;

export const collectionInsertSchema = createInsertSchema(collection);

export type collectionInsertType = z.infer<typeof collectionInsertSchema>;

export const statusSchema = z.object({
  status: z.string(),
  finished: z.boolean(),
  createdAt: z.string(),
});

export type status = z.infer<typeof statusSchema>;

export const orderItemSyncSchema = z.object({
  itemExternalId: z.int(),
  price: z.string(),
  count: z.number(),
  status: z.enum(ORDER_STATUSES),
  condition: z.enum(CONDITIONS),
  shippingMethod: z.enum(SHIPPING_METHODS),
  orderDate: z.string().nullable(),
  paymentDate: z.string().nullable(),
  shippingDate: z.string().nullable(),
  collectionDate: z.string().nullable(),
});

export type orderItemSyncType = z.infer<typeof orderItemSyncSchema>;

export const orderSyncSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  title: z.string(),
  shop: z.string(),
  orderDate: z.string().nullable(),
  releaseMonthYear: z.string().nullable(),
  paymentDate: z.string().nullable(),
  shippingDate: z.string().nullable(),
  collectionDate: z.string().nullable(),
  shippingMethod: z.enum(SHIPPING_METHODS),
  shippingFee: z.string(),
  taxes: z.string(),
  duties: z.string(),
  tariffs: z.string(),
  miscFees: z.string(),
  notes: z.string(),
  items: z.array(orderItemSyncSchema),
});

export type orderSyncType = z.infer<typeof orderSyncSchema>;

export const collectionSyncSchema = z.object({
  itemExternalId: z.int(),
  price: z.string(),
  count: z.number(),
  score: z.string(),
  shop: z.string(),
  orderDate: z.string().nullable(),
  paymentDate: z.string().nullable(),
  shippingDate: z.string().nullable(),
  collectionDate: z.string().nullable(),
  shippingMethod: z.enum(SHIPPING_METHODS),
  tags: z.array(z.string()),
  condition: z.enum(CONDITIONS),
  notes: z.string(),
});

export type collectionSyncType = z.infer<typeof collectionSyncSchema>;

export type UpdatedSyncCollection = collectionSyncType & {
  userId: string;
  releaseId: string | null;
  itemId: string | null;
};

export type UpdatedSyncOrder = Omit<orderSyncType, "items"> & {
  userId: string;
  id: string;
  releaseMonthYear: string | null;
};

export type UpdatedSyncOrderItem = orderItemSyncType & {
  userId: string;
  orderId: string;
  releaseId: string | null;
  itemId: string | null;
};
