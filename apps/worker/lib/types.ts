import type { Job } from "bullmq";
import * as z from "zod";

export interface scrapedItem {
  id: number;
  title: string;
  category: string;
  classification: {
    id: number;
    name: string;
    role: string;
  }[];
  origin: {
    id: number;
    name: string;
  }[];
  character: {
    id: number;
    name: string;
  }[];
  company: {
    id: number;
    name: string;
    role: string;
  }[];
  artist: {
    id: number;
    name: string;
    role: string;
  }[];
  version: string[];
  releaseDate: {
    date: string;
    type: string;
    price: number;
    priceCurrency: string;
    barcode: string;
  }[];
  event: {
    id: number;
    name: string;
    role: string;
  }[];
  materials: {
    id: number;
    name: string;
  }[];
  scale: string;
  height: number;
  width: number;
  depth: number;
  image: string;
}

export const syncOrderSchema = z.object({
  id: z.string(),
  userId: z.string(),
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
});

export const syncOrderItemSchema = z.object({
  userId: z.string(),
  orderId: z.string(),
  releaseId: z.string(),
  itemId: z.number(),
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

const csvItemSchema = z.object({
  id: z.number(),
  status: z.string(),
  count: z.number(),
  score: z.string(),
  payment_date: z.string().nullable(),
  shipping_date: z.string().nullable(),
  collecting_date: z.string().nullable(),
  price: z.string(),
  shop: z.string(),
  shipping_method: z.string(),
  note: z.string(),
  orderId: z.string().nullable(),
  orderDate: z.string().nullable(),
});

export type CsvItem = z.infer<typeof csvItemSchema>;

export const jobDataSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("csv"),
    userId: z.string(),
    items: z.array(csvItemSchema),
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

export interface jobData extends Job {
  data: JobData;
}
