import * as z from "zod";
import { collection } from "@myakiba/db/schema/figure";
import { createInsertSchema } from "drizzle-zod";
import { itemUploadSchema } from "@myakiba/contracts/mfc-items/schema";
import { ITEM_ERRORS } from "@myakiba/mfc/bridge";
import {
  syncOrderSchema,
  syncOrderItemInputSchema,
  syncCollectionItemSchema,
} from "@myakiba/contracts/sync/schema";

export {
  itemSyncSchema,
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
    items: z.array(syncOrderItemInputSchema).min(1),
  });

export type OrderSyncType = z.infer<typeof orderSyncSchema>;
export const collectionSyncSchema = syncCollectionItemSchema.omit({
  userId: true,
  releaseId: true,
  itemId: true,
});

export type CollectionSyncType = z.infer<typeof collectionSyncSchema>;
export type CollectionInsertType = z.infer<typeof collectionInsertSchema>;

export type ExistingItemWithLatestRelease = Readonly<{
  id: string;
  externalId: number;
  title: string;
  releaseId: string | null;
  releaseDate: string | null;
}>;

const SYNC_ITEM_FETCH_ERRORS = [...ITEM_ERRORS, "unknown"] as const;
export type SyncItemFetchError = (typeof SYNC_ITEM_FETCH_ERRORS)[number];

const jobIdSchema = z.string().min(1);

export const syncItemUploadSchema = itemUploadSchema.extend({ jobId: jobIdSchema });
export type SyncItemUpload = z.infer<typeof syncItemUploadSchema>;

export const syncItemFailureSchema = itemUploadSchema
  .pick({ mfcItemId: true })
  .extend({ jobId: jobIdSchema, error: z.enum(SYNC_ITEM_FETCH_ERRORS) });
