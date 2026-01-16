import * as z from "zod";
import {
  SHIPPING_METHODS,
  ORDER_STATUSES,
  CONDITIONS,
} from "@myakiba/constants";

export const syncOrderSchema = z.object({
  id: z.string(),
  userId: z.string(),
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
});

export const syncOrderItemSchema = z.object({
  userId: z.string(),
  orderId: z.string(),
  releaseId: z.string(),
  itemId: z.number(),
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

export const syncCollectionItemSchema = z.object({
  userId: z.string(),
  releaseId: z.string(),
  itemId: z.number(),
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

export const csvItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  root: z.string(),
  category: z.string(),
  release_date: z.string(),
  price: z.string(),
  scale: z.string(),
  barcode: z.string(),
  status: z
    .string()
    .transform((val) => val === "" ? undefined : val)
    .pipe(z.enum(["Owned", "Ordered", "Wished"]).default("Owned")),
  count: z
    .string()
    .transform((val) => val === "" ? undefined : val)
    .pipe(z.string().default("1")),
  score: z.string(),
  payment_date: z.string(),
  shipping_date: z.string(),
  collecting_date: z.string(),
  price_1: z.string(),
  shop: z.string(),
  shipping_method: z
    .string()
    .transform((val) => val === "" ? undefined : val)
    .pipe(z.enum(SHIPPING_METHODS).default("n/a")),
  tracking_number: z.string(),
  wishibility: z.string().optional(),
  note: z.string(),
});

export const csvSchema = z.array(csvItemSchema);

// Internal CSV item schema for worker processing
const internalCsvItemSchema = z.object({
  id: z.number(),
  status: z.string(),
  count: z.number(),
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

export type CsvItem = z.infer<typeof csvItemSchema>;
export type InternalCsvItem = z.infer<typeof internalCsvItemSchema>;

export const jobDataSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("csv"),
    userId: z.string(),
    items: z.array(internalCsvItemSchema),
  }),
  z.object({
    type: z.literal("order"),
    userId: z.string(),
    order: z.object({
      details: syncOrderSchema,
      itemsToScrape: z.array(syncOrderItemSchema),
      itemsToInsert: z.array(syncOrderItemSchema),
    }),
  }),
  z.object({
    type: z.literal("collection"),
    userId: z.string(),
    collection: z.object({
      itemsToScrape: z.array(syncCollectionItemSchema),
      itemsToInsert: z.array(syncCollectionItemSchema),
    }),
  }),
]);

export type UpdatedSyncOrder = z.infer<typeof syncOrderSchema>;
export type UpdatedSyncOrderItem = z.infer<typeof syncOrderItemSchema>;
export type UpdatedSyncCollection = z.infer<typeof syncCollectionItemSchema>;
export type JobData = z.infer<typeof jobDataSchema>;
