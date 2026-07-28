import * as z from "zod";
import type { SyncJobStatus } from "../sync/schema";
import {
  COLLECTION_STATUSES,
  CONDITIONS,
  ORDER_STATUSES,
  SHIPPING_METHODS,
} from "../shared/constants";
import {
  DATA_TRANSFER_FORMAT,
  DATA_TRANSFER_IMPORT_STATUSES,
  DATA_TRANSFER_MAX_RECORDS,
  DATA_TRANSFER_VERSION,
} from "./constants";

export {
  DATA_TRANSFER_FORMAT,
  DATA_TRANSFER_IMPORT_PHASES,
  DATA_TRANSFER_IMPORT_STATUSES,
  DATA_TRANSFER_MAX_BYTES,
  DATA_TRANSFER_MAX_RECORDS,
  DATA_TRANSFER_VERSION,
} from "./constants";

const integerSchema = z.number().int();
const postgresIntegerSchema = integerSchema.min(-2_147_483_648).max(2_147_483_647);
const nonnegativeIntegerSchema = postgresIntegerSchema.nonnegative();
const positiveIntegerSchema = postgresIntegerSchema.positive();
const portableKeySchema = z.string().min(1).max(128);
const fileNameSchema = z.string().min(1).max(255);
const isoDateSchema = z.iso.date();
const isoTimestampSchema = z.iso.datetime({ offset: true });

const dataTransferReleaseFingerprintSchema = z.strictObject({
  date: isoDateSchema,
  type: z.string().nullable(),
  price: integerSchema.nullable(),
  priceCurrency: z.string().nullable(),
  barcode: z.string().nullable(),
});

const dataTransferOrderV1Schema = z.strictObject({
  orderKey: portableKeySchema,
  title: z.string(),
  shop: z.string(),
  orderDate: isoDateSchema.nullable(),
  releaseDate: isoDateSchema.nullable(),
  paymentDate: isoDateSchema.nullable(),
  shippingDate: isoDateSchema.nullable(),
  collectionDate: isoDateSchema.nullable(),
  shippingMethod: z.enum(SHIPPING_METHODS),
  status: z.enum(ORDER_STATUSES),
  shippingFee: integerSchema,
  taxes: integerSchema,
  duties: integerSchema,
  tariffs: integerSchema,
  miscFees: integerSchema,
  notes: z.string(),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});

const dataTransferCollectionMetadataShape = {
  collectionKey: portableKeySchema,
  orderKey: portableKeySchema.nullable(),
  status: z.enum(COLLECTION_STATUSES),
  count: positiveIntegerSchema,
  score: z
    .string()
    .regex(/^-?\d{1,2}(?:\.\d)?$/, "Score must fit the decimal(3,1) database column"),
  price: integerSchema,
  shop: z.string(),
  orderDate: isoDateSchema.nullable(),
  paymentDate: isoDateSchema.nullable(),
  shippingDate: isoDateSchema.nullable(),
  collectionDate: isoDateSchema.nullable(),
  shippingMethod: z.enum(SHIPPING_METHODS),
  soldFor: integerSchema.nullable(),
  soldDate: isoDateSchema.nullable(),
  tags: z.array(z.string()).max(DATA_TRANSFER_MAX_RECORDS),
  condition: z.enum(CONDITIONS),
  notes: z.string(),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
};

const dataTransferMfcItemReferenceSchema = z.strictObject({
  source: z.literal("mfc"),
  externalId: positiveIntegerSchema,
  sourceTitle: z.string(),
  selectedRelease: dataTransferReleaseFingerprintSchema.nullable(),
});

const dataTransferCollectionItemV1Schema = z.strictObject({
  ...dataTransferCollectionMetadataShape,
  item: dataTransferMfcItemReferenceSchema,
});

export const dataTransferArchiveV1Schema = z
  .strictObject({
    format: z.literal(DATA_TRANSFER_FORMAT),
    version: z.literal(DATA_TRANSFER_VERSION),
    exportId: portableKeySchema,
    exportedAt: isoTimestampSchema,
    source: z.strictObject({
      application: z.literal("myakiba"),
    }),
    orders: z.array(dataTransferOrderV1Schema).max(DATA_TRANSFER_MAX_RECORDS),
    collectionItems: z.array(dataTransferCollectionItemV1Schema).max(DATA_TRANSFER_MAX_RECORDS),
  })
  .superRefine((archive, context) => {
    const recordCount = archive.orders.length + archive.collectionItems.length;
    if (recordCount === 0) {
      context.addIssue({
        code: "custom",
        message: "This myakiba export is empty.",
        path: [],
      });
    }

    if (recordCount > DATA_TRANSFER_MAX_RECORDS) {
      context.addIssue({
        code: "custom",
        message: `Archive exceeds the ${DATA_TRANSFER_MAX_RECORDS} record limit`,
        path: [],
      });
    }

    const orderKeys = new Set<string>();
    for (const [index, order] of archive.orders.entries()) {
      if (orderKeys.has(order.orderKey)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate export-local key: ${order.orderKey}`,
          path: ["orders", index, "orderKey"],
        });
      }
      orderKeys.add(order.orderKey);
    }

    const collectionKeys = new Set<string>();
    for (const [index, row] of archive.collectionItems.entries()) {
      if (collectionKeys.has(row.collectionKey)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate export-local key: ${row.collectionKey}`,
          path: ["collectionItems", index, "collectionKey"],
        });
      }
      collectionKeys.add(row.collectionKey);

      if (row.orderKey !== null && !orderKeys.has(row.orderKey)) {
        context.addIssue({
          code: "custom",
          message: `Unknown orderKey: ${row.orderKey}`,
          path: ["collectionItems", index, "orderKey"],
        });
      }
    }
  });

export const dataTransferImportRequestSchema = z.strictObject({
  fileName: fileNameSchema,
  archive: dataTransferArchiveV1Schema,
});

const dataTransferFailedReportRowSchema = z.strictObject({
  collectionKey: portableKeySchema,
  externalId: positiveIntegerSchema,
  title: z.string(),
  reason: z.string(),
});

const dataTransferReleaseSubstitutionSchema = z.strictObject({
  collectionKey: portableKeySchema,
  externalId: positiveIntegerSchema,
  title: z.string(),
  requested: dataTransferReleaseFingerprintSchema,
  imported: dataTransferReleaseFingerprintSchema,
});

const dataTransferMissingReleaseSchema = z.strictObject({
  collectionKey: portableKeySchema,
  externalId: positiveIntegerSchema,
  title: z.string(),
  requested: dataTransferReleaseFingerprintSchema,
});

const dataTransferImportReportSchema = z.strictObject({
  failedRows: z.array(dataTransferFailedReportRowSchema).max(DATA_TRANSFER_MAX_RECORDS),
  releaseSubstitutions: z
    .array(dataTransferReleaseSubstitutionSchema)
    .max(DATA_TRANSFER_MAX_RECORDS),
  missingReleases: z.array(dataTransferMissingReleaseSchema).max(DATA_TRANSFER_MAX_RECORDS),
});

const dataTransferImportResultShape = {
  importedOrders: nonnegativeIntegerSchema,
  importedCollectionItems: nonnegativeIntegerSchema,
  failedCollectionItems: nonnegativeIntegerSchema,
  report: dataTransferImportReportSchema.nullable(),
  error: z.string().nullable(),
};

export const dataTransferImportResultSchema = z.strictObject({
  status: z.enum(["completed", "partial", "failed"]),
  ...dataTransferImportResultShape,
});

export const dataTransferImportSchema = z.strictObject({
  id: portableKeySchema,
  fileName: fileNameSchema,
  status: z.enum(DATA_TRANSFER_IMPORT_STATUSES),
  ...dataTransferImportResultShape,
});

export type DataTransferReleaseFingerprint = z.infer<typeof dataTransferReleaseFingerprintSchema>;
export type DataTransferCollectionItemV1 = z.infer<typeof dataTransferCollectionItemV1Schema>;
export type DataTransferArchiveV1 = z.infer<typeof dataTransferArchiveV1Schema>;
export type DataTransferImportRequest = z.infer<typeof dataTransferImportRequestSchema>;
export type DataTransferImportReport = z.infer<typeof dataTransferImportReportSchema>;
export type DataTransferImportResult = z.infer<typeof dataTransferImportResultSchema>;
export type DataTransferImport = z.infer<typeof dataTransferImportSchema>;
export type DataTransferImportTerminalStatus = Pick<
  SyncJobStatus,
  "phase" | "statusMessage" | "terminalState" | "error"
>;
