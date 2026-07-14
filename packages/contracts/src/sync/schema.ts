import * as z from "zod";
import {
  CONDITIONS,
  ORDER_STATUSES,
  SHIPPING_METHODS,
  SYNC_SESSION_STATUSES,
  SYNC_TYPES,
} from "../shared/constants";
import type { SyncSessionStatus } from "../shared/types";
import { paginationLimitSchema, paginationPageSchema } from "../shared/pagination";
import { SYNC_CSV_ITEM_STATUSES } from "./constants";

/**
 * Schema for CSV date fields that handles MFC export quirks.
 * - Returns null for placeholder dates (0000-00-00)
 * - Normalizes dates with 00 values (e.g., "2002-00-00" -> "2002-01-01")
 */
const csvDateSchema = z
  .string()
  .transform((value): string | null => {
    if (value.trim() === "") return null;
    if (value === "0000-00-00") return null;
    return value.replaceAll("-00", "-01");
  })
  .pipe(z.iso.date().nullable());

export const syncSearchSchema = z.object({
  page: paginationPageSchema.optional(),
  limit: paginationLimitSchema.optional(),
  status: z.array(z.enum(SYNC_SESSION_STATUSES)).optional(),
  syncType: z.array(z.enum(SYNC_TYPES)).optional(),
});

export const syncTerminalStateSchema = z.enum(["success", "partial", "error", "timeout"]);

export const syncJobPhaseSchema = z.enum([
  "queued",
  "scraping",
  "persisting",
  "completed",
  "failed",
]);

export const syncJobProgressSchema = z.object({
  processed: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  succeeded: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
});

export const syncJobRecentItemSchema = z.object({
  externalId: z.number().int(),
  title: z.string().nullable(),
  outcome: z.enum(["succeeded", "failed"]),
  failureReason: z.string().nullable(),
  completedAt: z.iso.datetime(),
});

export const syncJobErrorCodeSchema = z.enum([
  "queue_failed",
  "scrape_failed",
  "persistence_failed",
  "invalid_payload",
  "connection_lost",
  "timeout",
  "unknown",
]);

export const syncJobErrorSchema = z.object({
  code: syncJobErrorCodeSchema,
  message: z.string(),
});

export const syncJobStatusSchema = z.object({
  jobId: z.string(),
  phase: syncJobPhaseSchema,
  statusMessage: z.string(),
  progress: syncJobProgressSchema.nullable(),
  recentItems: z.array(syncJobRecentItemSchema).max(5).readonly(),
  error: syncJobErrorSchema.nullable(),
  startedAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  terminalState: syncTerminalStateSchema.nullable().default(null),
});

export const syncOrderSchema = z.object({
  id: z.string(),
  userId: z.string(),
  status: z.enum(ORDER_STATUSES),
  title: z.string(),
  shop: z.string().trim(),
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

export const syncOrderItemInputSchema = syncOrderItemSchema.omit({
  collectionId: true,
  userId: true,
  orderId: true,
  releaseId: true,
  itemId: true,
});

export const syncOrderItemsSchema = z.object({
  orderId: z.string(),
  items: z.array(syncOrderItemInputSchema),
});

export const syncCollectionItemSchema = z.object({
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
    .transform((value) => (value === "" ? undefined : value))
    .pipe(z.enum(["Owned", "Ordered", "Wished"]).default("Owned")),
  count: z
    .string()
    .transform((value) => (value === "" ? undefined : value))
    .pipe(z.string().default("1")),
  score: z.string(),
  payment_date: csvDateSchema,
  shipping_date: csvDateSchema,
  collecting_date: csvDateSchema,
  price_1: z.string(),
  shop: z.string().trim(),
  shipping_method: z
    .string()
    .transform((value) => (value === "" ? undefined : value))
    .pipe(z.enum(SHIPPING_METHODS).default("n/a")),
  tracking_number: z.string(),
  wishibility: z.string().optional(),
  note: z.string(),
});

export const csvSchema = z.array(csvItemSchema);

export const internalCsvItemSchema = z.object({
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

export const csvItemMetadataSchema = internalCsvItemSchema.omit({
  collectionId: true,
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
  collectionId: true,
  userId: true,
  releaseId: true,
  itemId: true,
  itemExternalId: true,
});

export const queuedCollectionItemSchema = z.object({
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

export const jobDataSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("csv"),
    payloadVersion: z.literal(2),
    userId: z.string(),
    syncSessionId: z.string(),
    items: z.array(internalCsvItemSchema),
    itemsToInsert: z.array(queuedCollectionItemSchema),
    ordersToInsert: z.array(syncOrderSchema),
  }),
  z.object({
    type: z.literal("order"),
    payloadVersion: z.literal(2),
    userId: z.string(),
    syncSessionId: z.string(),
    order: z.object({
      details: syncOrderSchema,
      itemsToScrape: z.array(syncOrderItemSchema),
      itemsToInsert: z.array(queuedCollectionItemSchema),
    }),
  }),
  z.object({
    type: z.literal("order-item"),
    payloadVersion: z.literal(2),
    userId: z.string(),
    syncSessionId: z.string(),
    order: z.object({
      details: syncOrderSchema,
      itemsToScrape: z.array(syncOrderItemSchema),
      itemsToInsert: z.array(queuedCollectionItemSchema),
    }),
  }),
  z.object({
    type: z.literal("collection"),
    payloadVersion: z.literal(2),
    userId: z.string(),
    syncSessionId: z.string(),
    collection: z.object({
      itemsToScrape: z.array(syncCollectionItemSchema),
      itemsToInsert: z.array(queuedCollectionItemSchema),
    }),
  }),
]);

export type SyncTerminalState = z.infer<typeof syncTerminalStateSchema>;
export type SyncJobPhase = z.infer<typeof syncJobPhaseSchema>;
export type SyncJobProgress = z.infer<typeof syncJobProgressSchema>;
export type SyncJobRecentItem = z.infer<typeof syncJobRecentItemSchema>;
export type SyncJobErrorCode = z.infer<typeof syncJobErrorCodeSchema>;
export type SyncJobError = z.infer<typeof syncJobErrorSchema>;
export type SyncJobStatus = z.infer<typeof syncJobStatusSchema>;

/**
 * Maps a persisted session status to the closest `SyncJobPhase` snapshot.
 *
 * Use this when rebuilding a job-status payload from durable session data,
 * especially after Redis expires or when cleanup code only has the persisted
 * `SyncSessionStatus`.
 *
 * This is intentionally lossy:
 * - `processing` maps to `scraping` because persistence is not stored durably
 * - `partial` maps to `completed` because partial is a terminal outcome, not a phase
 *
 * Do not use this for live worker transitions; the worker should set `phase`
 * explicitly as it moves through queued/scraping/persisting.
 *
 * @example
 * sessionStatusToPhase("pending")
 * // "queued"
 *
 * @example
 * sessionStatusToPhase("partial")
 * // "completed"
 */
export const sessionStatusToPhase = (status: SyncSessionStatus): SyncJobPhase => {
  switch (status) {
    case "pending":
      return "queued";
    case "processing":
      return "scraping";
    case "completed":
    case "partial":
      return "completed";
    case "failed":
      return "failed";
  }
};

/**
 * Maps a persisted session status to the terminal state shown in live UI flows.
 *
 * Use this when a caller needs to answer "is this job done, and if so how did
 * it end?" from persisted session data alone.
 *
 * Return value meaning:
 * - `null`: still in flight
 * - `"success"`: finished cleanly
 * - `"partial"`: finished with mixed success/failure
 * - `"error"`: terminal failure
 *
 * This helper belongs in contracts because both server and worker use the same
 * status-to-terminal mapping.
 *
 * @example
 * sessionStatusToTerminalState("processing")
 * // null
 *
 * @example
 * sessionStatusToTerminalState("failed")
 * // "error"
 */
export const sessionStatusToTerminalState = (
  status: SyncSessionStatus,
): SyncTerminalState | null => {
  switch (status) {
    case "completed":
      return "success";
    case "partial":
      return "partial";
    case "failed":
      return "error";
    case "pending":
    case "processing":
      return null;
  }
};
export type CsvItem = z.infer<typeof csvItemSchema>;
export type NormalizedInternalCsvItem = z.infer<typeof internalCsvItemSchema>;
export type InternalCsvItem = Omit<NormalizedInternalCsvItem, "collectionId"> & {
  readonly collectionId?: string;
};
export type QueuedCollectionItem = z.infer<typeof queuedCollectionItemSchema>;
export type CsvItemMetadata = z.infer<typeof csvItemMetadataSchema>;
export type OrderItemMetadata = z.infer<typeof orderItemMetadataSchema>;
export type CollectionItemMetadata = z.infer<typeof collectionItemMetadataSchema>;
export type UpdatedSyncOrder = z.infer<typeof syncOrderSchema>;
export type UpdatedSyncOrderItem = z.infer<typeof syncOrderItemSchema>;
export type UpdatedSyncCollection = z.infer<typeof syncCollectionItemSchema>;
export type SyncOrderItemInput = z.infer<typeof syncOrderItemInputSchema>;
export type SyncOrderItemsInput = z.infer<typeof syncOrderItemsSchema>;
export type JobData = z.infer<typeof jobDataSchema>;
