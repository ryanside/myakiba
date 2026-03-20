import * as z from "zod";
import { collection } from "@myakiba/db/schema/figure";
import { createInsertSchema } from "drizzle-zod";
import {
  syncOrderSchema,
  syncOrderItemInputSchema,
  syncCollectionItemSchema,
} from "@myakiba/schemas/sync";

export {
  internalCsvItemSchema,
  syncTerminalStateSchema,
  syncJobStatusSchema,
  syncOrderItemInputSchema,
  syncOrderItemsSchema,
} from "@myakiba/schemas/sync";

export type {
  InternalCsvItem,
  SyncTerminalState,
  SyncJobStatus,
  SyncOrderItemInput,
  SyncOrderItems,
} from "@myakiba/schemas/sync";

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
