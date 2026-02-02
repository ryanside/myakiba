import * as z from "zod";
import { createInsertSchema } from "drizzle-zod";
import { collection, order } from "@myakiba/db/schema/figure";
import { ORDER_STATUSES, CONDITIONS, SHIPPING_METHODS } from "@myakiba/constants";

export const csvItemSchema = z.object({
  itemExternalId: z.int(),
  status: z.enum(["Owned", "Ordered"]),
  count: z.int(),
  score: z.string(),
  payment_date: z.iso.date().nullable(),
  shipping_date: z.iso.date().nullable(),
  collecting_date: z.iso.date().nullable(),
  price: z.string(),
  shop: z.string(),
  shipping_method: z.enum(SHIPPING_METHODS),
  note: z.string(),
  orderId: z.string().nullable(),
  orderDate: z.iso.date().nullable(),
});

export type csvItem = z.infer<typeof csvItemSchema>;

export const orderInsertSchema = createInsertSchema(order);

export type orderInsertType = z.infer<typeof orderInsertSchema>;

export const collectionInsertSchema = createInsertSchema(collection);

export type collectionInsertType = z.infer<typeof collectionInsertSchema>;

export const statusSchema = z.object({
  status: z.string(),
  finished: z.boolean(),
  createdAt: z.iso.datetime(),
});

export type status = z.infer<typeof statusSchema>;

export const orderItemSyncSchema = z.object({
  itemExternalId: z.int(),
  price: z.number().int(),
  count: z.number(),
  status: z.enum(ORDER_STATUSES),
  condition: z.enum(CONDITIONS),
  shippingMethod: z.enum(SHIPPING_METHODS),
  orderDate: z.iso.date().nullable(),
  paymentDate: z.iso.date().nullable(),
  shippingDate: z.iso.date().nullable(),
  collectionDate: z.iso.date().nullable(),
});

export type orderItemSyncType = z.infer<typeof orderItemSyncSchema>;

export const orderSyncSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  title: z.string(),
  shop: z.string(),
  orderDate: z.iso.date().nullable(),
  releaseDate: z.iso.date().nullable(),
  paymentDate: z.iso.date().nullable(),
  shippingDate: z.iso.date().nullable(),
  collectionDate: z.iso.date().nullable(),
  shippingMethod: z.enum(SHIPPING_METHODS),
  shippingFee: z.number().int(),
  taxes: z.number().int(),
  duties: z.number().int(),
  tariffs: z.number().int(),
  miscFees: z.number().int(),
  notes: z.string(),
  items: z.array(orderItemSyncSchema),
});

export type orderSyncType = z.infer<typeof orderSyncSchema>;

export const collectionSyncSchema = z.object({
  itemExternalId: z.int(),
  price: z.number().int(),
  count: z.number(),
  score: z.string(),
  shop: z.string(),
  orderDate: z.iso.date().nullable(),
  paymentDate: z.iso.date().nullable(),
  shippingDate: z.iso.date().nullable(),
  collectionDate: z.iso.date().nullable(),
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
  releaseDate: string | null;
};

export type UpdatedSyncOrderItem = orderItemSyncType & {
  userId: string;
  orderId: string;
  releaseId: string | null;
  itemId: string | null;
};
