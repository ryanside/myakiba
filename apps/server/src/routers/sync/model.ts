import * as z from "zod";
import { createInsertSchema } from "drizzle-zod";
import { collection, order } from "@myakiba/db/schema/figure";

export const csvItemSchema = z.object({
  id: z.int(),
  status: z.enum(["Owned", "Ordered"]),
  count: z.int(),
  score: z.string(),
  payment_date: z.string().nullable(),
  shipping_date: z.string().nullable(),
  collecting_date: z.string().nullable(),
  price: z.string(),
  shop: z.string(),
  shipping_method: z.enum([
    "n/a",
    "EMS",
    "SAL",
    "AIRMAIL",
    "SURFACE",
    "FEDEX",
    "DHL",
    "Colissimo",
    "UPS",
    "Domestic",
  ]),
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
  itemId: z.int(),
  price: z.string(),
  count: z.number(),
  status: z.enum(["Ordered", "Paid", "Shipped", "Owned"]),
  condition: z.enum(["New", "Pre-Owned"]),
  shippingMethod: z.enum([
    "n/a",
    "EMS",
    "SAL",
    "AIRMAIL",
    "SURFACE",
    "FEDEX",
    "DHL",
    "Colissimo",
    "UPS",
    "Domestic",
  ]),
  orderDate: z.string().nullable(),
  paymentDate: z.string().nullable(),
  shippingDate: z.string().nullable(),
  collectionDate: z.string().nullable(),
});

export type orderItemSyncType = z.infer<typeof orderItemSyncSchema>;

export const orderSyncSchema = z.object({
  status: z.enum(["Ordered", "Paid", "Shipped", "Owned"]),
  title: z.string(),
  shop: z.string(),
  orderDate: z.string().nullable(),
  releaseMonthYear: z.string().nullable(),
  paymentDate: z.string().nullable(),
  shippingDate: z.string().nullable(),
  collectionDate: z.string().nullable(),
  shippingMethod: z.enum([
    "n/a",
    "EMS",
    "SAL",
    "AIRMAIL",
    "SURFACE",
    "FEDEX",
    "DHL",
    "Colissimo",
    "UPS",
    "Domestic",
  ]),
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
  itemId: z.int(),
  price: z.string(),
  count: z.number(),
  score: z.string(),
  shop: z.string(),
  orderDate: z.string().nullable(),
  paymentDate: z.string().nullable(),
  shippingDate: z.string().nullable(),
  collectionDate: z.string().nullable(),
  shippingMethod: z.enum([
    "n/a",
    "EMS",
    "SAL",
    "AIRMAIL",
    "SURFACE",
    "FEDEX",
    "DHL",
    "Colissimo",
    "UPS",
    "Domestic",
  ]),
  tags: z.array(z.string()),
  condition: z.enum(["New", "Pre-Owned"]),
  notes: z.string(),
});

export type collectionSyncType = z.infer<typeof collectionSyncSchema>;

export type UpdatedSyncCollection = collectionSyncType & {
  userId: string;
  releaseId: string;
};

export type UpdatedSyncOrder = Omit<orderSyncType, "items"> & {
  userId: string;
  id: string;
  releaseMonthYear: string | null;
};

export type UpdatedSyncOrderItem = orderItemSyncType & {
  userId: string;
  orderId: string;
  releaseId: string;
};
