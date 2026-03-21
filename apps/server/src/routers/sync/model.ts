import * as z from "zod";
import { collection } from "@myakiba/db/schema/figure";
import { createInsertSchema } from "drizzle-zod";
import {
  syncOrderSchema,
  syncOrderItemInputSchema,
  syncCollectionItemSchema,
} from "@myakiba/contracts/sync/schema";

export {
  internalCsvItemSchema,
  syncTerminalStateSchema,
  syncJobStatusSchema,
  syncOrderItemInputSchema,
  syncOrderItemsSchema,
} from "@myakiba/contracts/sync/schema";

export type {
  InternalCsvItem,
  SyncTerminalState,
  SyncJobStatus,
  SyncOrderItemInput,
  SyncOrderItemsInput,
} from "@myakiba/contracts/sync/schema";

export const collectionInsertSchema = createInsertSchema(collection);

export const orderSyncSchema = syncOrderSchema
  .omit({
    id: true,
    userId: true,
  })
  .extend({
    items: z.array(syncOrderItemInputSchema),
  });

export type OrderSyncType = z.infer<typeof orderSyncSchema>;
export const collectionSyncSchema = syncCollectionItemSchema.omit({
  userId: true,
  releaseId: true,
  itemId: true,
});

export type CollectionSyncType = z.infer<typeof collectionSyncSchema>;
export type CollectionInsertType = z.infer<typeof collectionInsertSchema>;
