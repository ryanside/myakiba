import * as z from "zod";
import { collection } from "@myakiba/db/schema/figure";
import { createInsertSchema } from "drizzle-zod";
import {
  internalCsvItemSchema as sharedInternalCsvItemSchema,
  syncTerminalStateSchema as sharedSyncTerminalStateSchema,
  syncJobStatusSchema as sharedSyncJobStatusSchema,
  syncOrderSchema as sharedSyncOrderSchema,
  syncOrderItemSchema as sharedSyncOrderItemSchema,
  syncCollectionItemSchema as sharedSyncCollectionItemSchema,
} from "@myakiba/schemas";
import type {
  InternalCsvItem,
  SyncTerminalState as SharedSyncTerminalState,
  SyncJobStatus as SharedSyncJobStatus,
  UpdatedSyncOrder,
  UpdatedSyncOrderItem,
  UpdatedSyncCollection,
} from "@myakiba/schemas";

export const csvItemSchema = sharedInternalCsvItemSchema;
export type CsvItem = InternalCsvItem;

export const syncTerminalStateSchema = sharedSyncTerminalStateSchema;
export type SyncTerminalState = SharedSyncTerminalState;

export const statusSchema = sharedSyncJobStatusSchema;
export type Status = SharedSyncJobStatus;

export const collectionInsertSchema = createInsertSchema(collection);

export const orderItemSyncSchema = sharedSyncOrderItemSchema.omit({
  userId: true,
  orderId: true,
  releaseId: true,
  itemId: true,
});

export type OrderItemSyncType = z.infer<typeof orderItemSyncSchema>;

export const orderSyncSchema = sharedSyncOrderSchema
  .omit({
    id: true,
    userId: true,
  })
  .extend({
    items: z.array(orderItemSyncSchema),
  });

export type OrderSyncType = z.infer<typeof orderSyncSchema>;
export const collectionSyncSchema = sharedSyncCollectionItemSchema.omit({
  userId: true,
  releaseId: true,
  itemId: true,
});

export type CollectionSyncType = z.infer<typeof collectionSyncSchema>;
export type CollectionInsertType = z.infer<typeof collectionInsertSchema>;
export type { UpdatedSyncCollection, UpdatedSyncOrder, UpdatedSyncOrderItem };
