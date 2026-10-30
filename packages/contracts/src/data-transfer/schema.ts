import * as z from "zod";
import {
  COLLECTION_STATUSES,
  CONDITIONS,
  ORDER_STATUSES,
  SHIPPING_METHODS,
} from "../shared/constants";
import { DATA_TRANSFER_FORMAT, DATA_TRANSFER_VERSION } from "./constants";

const isoDateSchema = z.iso.date();
const isoTimestampSchema = z.iso.datetime();

const dataTransferOrderV1Schema = z.strictObject({
  orderKey: z.string(),
  title: z.string(),
  shop: z.string(),
  orderDate: isoDateSchema.nullable(),
  releaseDate: isoDateSchema.nullable(),
  paymentDate: isoDateSchema.nullable(),
  shippingDate: isoDateSchema.nullable(),
  collectionDate: isoDateSchema.nullable(),
  shippingMethod: z.enum(SHIPPING_METHODS),
  status: z.enum(ORDER_STATUSES),
  shippingFee: z.number(),
  taxes: z.number(),
  duties: z.number(),
  tariffs: z.number(),
  miscFees: z.number(),
  notes: z.string(),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});

const dataTransferCollectionItemV1Schema = z.strictObject({
  collectionKey: z.string(),
  orderKey: z.string().nullable(),
  status: z.enum(COLLECTION_STATUSES),
  count: z.number(),
  score: z.string(),
  price: z.number(),
  shop: z.string(),
  orderDate: isoDateSchema.nullable(),
  paymentDate: isoDateSchema.nullable(),
  shippingDate: isoDateSchema.nullable(),
  collectionDate: isoDateSchema.nullable(),
  shippingMethod: z.enum(SHIPPING_METHODS),
  soldFor: z.number().nullable(),
  soldDate: isoDateSchema.nullable(),
  tags: z.array(z.string()),
  condition: z.enum(CONDITIONS),
  notes: z.string(),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
  item: z.strictObject({
    source: z.literal("mfc"),
    externalId: z.number(),
    sourceTitle: z.string(),
    selectedRelease: z
      .strictObject({
        date: isoDateSchema,
        type: z.string().nullable(),
        price: z.number().nullable(),
        priceCurrency: z.string().nullable(),
        barcode: z.string().nullable(),
      })
      .nullable(),
  }),
});

const dataTransferArchiveV1Schema = z.strictObject({
  format: z.literal(DATA_TRANSFER_FORMAT),
  version: z.literal(DATA_TRANSFER_VERSION),
  exportId: z.string(),
  exportedAt: isoTimestampSchema,
  source: z.strictObject({ application: z.literal("myakiba") }),
  orders: z.array(dataTransferOrderV1Schema),
  collectionItems: z.array(dataTransferCollectionItemV1Schema),
});

const dataTransferImportReportSchema = z.strictObject({
  failureReasons: z.array(z.strictObject({ reason: z.string(), count: z.number() })),
  releaseSubstitutions: z.number(),
  missingReleases: z.number(),
});

export type DataTransferCollectionItemV1 = z.infer<typeof dataTransferCollectionItemV1Schema>;
export type DataTransferArchiveV1 = z.infer<typeof dataTransferArchiveV1Schema>;
export type DataTransferImportReport = z.infer<typeof dataTransferImportReportSchema>;
