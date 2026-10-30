import * as z from "zod";
import { CONDITIONS, ORDER_STATUSES, SHIPPING_METHODS } from "../shared/constants";
import { newOrderSchema } from "../orders/schema";
import { MAX_ITEM_SYNC_ITEMS, SYNC_CSV_ITEM_STATUSES } from "./constants";

// The shape of `sync_session.request_payload`. Kept only for that column's type until the table goes.
const syncOrderSchema = newOrderSchema.extend({ id: z.string(), userId: z.string() });

const syncPriceWarningSchema = z.object({
  mfcItemId: z.number().int().positive(),
  input: z.string(),
});

const syncOrderItemSchema = z.object({
  collectionId: z.string(),
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

const syncCollectionItemSchema = z.object({
  collectionId: z.string(),
  userId: z.string(),
  releaseId: z.string().nullable(),
  itemId: z.string().nullable(),
  itemExternalId: z.number(),
  price: z.number().int(),
  count: z.number(),
  score: z.string(),
  shop: z.string().trim(),
  orderDate: z.iso.date().nullable(),
  paymentDate: z.iso.date().nullable(),
  shippingDate: z.iso.date().nullable(),
  collectionDate: z.iso.date().nullable(),
  shippingMethod: z.enum(SHIPPING_METHODS),
  tags: z.array(z.string()),
  condition: z.enum(CONDITIONS),
  notes: z.string(),
});

const internalCsvItemSchema = z.object({
  collectionId: z.string(),
  itemExternalId: z.number(),
  status: z.enum(SYNC_CSV_ITEM_STATUSES),
  count: z.number(),
  score: z.string(),
  payment_date: z.iso.date().nullable(),
  shipping_date: z.iso.date().nullable(),
  collecting_date: z.iso.date().nullable(),
  price: z.string(),
  shop: z.string().trim(),
  shipping_method: z.enum(SHIPPING_METHODS),
  note: z.string(),
  orderId: z.string().nullable(),
  orderDate: z.iso.date().nullable(),
});

const queuedCollectionItemSchema = z.object({
  id: z.string(),
  userId: z.string(),
  itemId: z.string(),
  orderId: z.string().nullable(),
  status: z.enum(ORDER_STATUSES),
  count: z.number(),
  releaseId: z.string().nullable(),
  score: z.string(),
  price: z.number().int(),
  shop: z.string().trim(),
  orderDate: z.iso.date().nullable(),
  paymentDate: z.iso.date().nullable(),
  shippingDate: z.iso.date().nullable(),
  collectionDate: z.iso.date().nullable(),
  shippingMethod: z.enum(SHIPPING_METHODS),
  tags: z.array(z.string()),
  condition: z.enum(CONDITIONS),
  notes: z.string(),
});

const pricedCsvItemSchema = internalCsvItemSchema.extend({
  priceMinorUnits: z.number().int(),
});

const csvJobDataSchema = z.object({
  type: z.literal("csv"),
  warnings: z.array(syncPriceWarningSchema).default([]),
  payloadVersion: z.literal(3),
  userId: z.string(),
  syncSessionId: z.string(),
  items: z.array(pricedCsvItemSchema),
  itemsToInsert: z.array(queuedCollectionItemSchema),
  ordersToInsert: z.array(syncOrderSchema),
});

const jobDataSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("item"),
    payloadVersion: z.literal(3),
    userId: z.string(),
    syncSessionId: z.string(),
    itemExternalIds: z.array(z.number().int().positive()).min(1).max(MAX_ITEM_SYNC_ITEMS),
  }),
  csvJobDataSchema,
  z.object({
    type: z.literal("order"),
    payloadVersion: z.literal(3),
    userId: z.string(),
    syncSessionId: z.string(),
    order: z.object({
      details: syncOrderSchema,
      itemsToFetch: z.array(syncOrderItemSchema),
      itemsToInsert: z.array(queuedCollectionItemSchema),
    }),
  }),
  z.object({
    type: z.literal("order-item"),
    payloadVersion: z.literal(3),
    userId: z.string(),
    syncSessionId: z.string(),
    order: z.object({
      details: syncOrderSchema,
      itemsToFetch: z.array(syncOrderItemSchema),
      itemsToInsert: z.array(queuedCollectionItemSchema),
    }),
  }),
  z.object({
    type: z.literal("collection"),
    payloadVersion: z.literal(3),
    userId: z.string(),
    syncSessionId: z.string(),
    collection: z.object({
      itemsToFetch: z.array(syncCollectionItemSchema),
      itemsToInsert: z.array(queuedCollectionItemSchema),
    }),
  }),
]);

export type JobData = z.infer<typeof jobDataSchema>;
