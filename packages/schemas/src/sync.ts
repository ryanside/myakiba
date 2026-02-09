import * as z from "zod";
import { SHIPPING_METHODS, ORDER_STATUSES, CONDITIONS } from "@myakiba/constants";

/**
 * Schema for CSV date fields that handles MFC export quirks.
 * - Returns null for placeholder dates (0000-00-00)
 * - Normalizes dates with 00 values (e.g., "2002-00-00" → "2002-01-01")
 */
const csvDateSchema = z
  .string()
  .transform((val): string | null => {
    if (val.trim() === "") return null;
    // Handle all-zeros placeholder date
    if (val === "0000-00-00") return null;
    // Replace 00 month/day with 01: 2002-00-00 → 2002-01-01
    return val.replace(/-00/g, "-01");
  })
  .pipe(z.iso.date().nullable());

export const syncOrderSchema = z.object({
  id: z.string(),
  userId: z.string(),
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
});

export const syncOrderItemSchema = z.object({
  userId: z.string(),
  orderId: z.string(),
  releaseId: z.string().nullable(),
  itemId: z.string().nullable(),
  itemExternalId: z.number(),
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

export const syncCollectionItemSchema = z.object({
  userId: z.string(),
  releaseId: z.string().nullable(),
  itemId: z.string().nullable(),
  itemExternalId: z.number(),
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

export const csvItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  root: z.string(),
  category: z.string(),
  release_date: csvDateSchema,
  price: z.string(),
  scale: z.string(),
  barcode: z.string(),
  status: z
    .string()
    .transform((val) => (val === "" ? undefined : val))
    .pipe(z.enum(["Owned", "Ordered", "Wished"]).default("Owned")),
  count: z
    .string()
    .transform((val) => (val === "" ? undefined : val))
    .pipe(z.string().default("1")),
  score: z.string(),
  payment_date: csvDateSchema,
  shipping_date: csvDateSchema,
  collecting_date: csvDateSchema,
  price_1: z.string(),
  shop: z.string(),
  shipping_method: z
    .string()
    .transform((val) => (val === "" ? undefined : val))
    .pipe(z.enum(SHIPPING_METHODS).default("n/a")),
  tracking_number: z.string(),
  wishibility: z.string().optional(),
  note: z.string(),
});

export const csvSchema = z.array(csvItemSchema);

// Internal CSV item schema for worker processing
const internalCsvItemSchema = z.object({
  itemExternalId: z.number(),
  status: z.string(),
  count: z.number(),
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

export type CsvItem = z.infer<typeof csvItemSchema>;
export type InternalCsvItem = z.infer<typeof internalCsvItemSchema>;

export const csvItemMetadataSchema = internalCsvItemSchema.omit({
  itemExternalId: true,
});

export const orderItemMetadataSchema = syncOrderItemSchema.pick({
  price: true,
  count: true,
  status: true,
  condition: true,
  shippingMethod: true,
  orderDate: true,
  paymentDate: true,
  shippingDate: true,
  collectionDate: true,
});

export const collectionItemMetadataSchema = syncCollectionItemSchema.omit({
  userId: true,
  releaseId: true,
  itemId: true,
  itemExternalId: true,
});

export type CsvItemMetadata = z.infer<typeof csvItemMetadataSchema>;
export type OrderItemMetadata = z.infer<typeof orderItemMetadataSchema>;
export type CollectionItemMetadata = z.infer<typeof collectionItemMetadataSchema>;

export const jobDataSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("csv"),
    userId: z.string(),
    syncSessionId: z.string(),
    items: z.array(internalCsvItemSchema),
  }),
  z.object({
    type: z.literal("order"),
    userId: z.string(),
    syncSessionId: z.string(),
    order: z.object({
      details: syncOrderSchema,
      itemsToScrape: z.array(syncOrderItemSchema),
      itemsToInsert: z.array(syncOrderItemSchema),
    }),
  }),
  z.object({
    type: z.literal("collection"),
    userId: z.string(),
    syncSessionId: z.string(),
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
