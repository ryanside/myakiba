import * as z from "zod";
import {
  CATEGORIES,
  COLLECTION_STATUSES,
  CONDITIONS,
  SHIPPING_METHODS,
} from "@myakiba/contracts/shared/constants";
import { collectionSearchSortSchema } from "@myakiba/contracts/search/schema";
import { MAX_ADD_ROWS } from "@myakiba/contracts/add/constants";
import { countSchema, itemIdField } from "@myakiba/contracts/add/schema";
import { collectionSearchSchema } from "@myakiba/contracts/collection/schema";
import { pageFields } from "@myakiba/contracts/shared/pagination";
import { idListSchema, WRITE_LIMITS } from "@myakiba/contracts/shared/write-limits";
import {
  commaSeparatedStringArraySchema,
  createCommaSeparatedEnumArraySchema,
} from "@myakiba/contracts/search/query-params";

const commaSeparatedShipMethodArray = createCommaSeparatedEnumArraySchema(SHIPPING_METHODS);
const commaSeparatedConditionArray = createCommaSeparatedEnumArraySchema(CONDITIONS);
const commaSeparatedCategoryArray = createCommaSeparatedEnumArraySchema(CATEGORIES);

export const collectionQuerySchema = collectionSearchSchema.extend({
  ...pageFields(collectionSearchSortSchema, "createdAt"),
  shop: commaSeparatedStringArraySchema,
  shipMethod: commaSeparatedShipMethodArray,
  relCurrency: commaSeparatedStringArraySchema,
  category: commaSeparatedCategoryArray,
  entries: commaSeparatedStringArraySchema,
  scale: commaSeparatedStringArraySchema,
  tags: commaSeparatedStringArraySchema,
  condition: commaSeparatedConditionArray,
  ids: commaSeparatedStringArraySchema.pipe(z.array(itemIdField).max(MAX_ADD_ROWS).optional()),
});

export type CollectionQuery = z.infer<typeof collectionQuerySchema>;

export const collectionParamSchema = z.object({
  id: z.string().max(WRITE_LIMITS.id),
});

export const collectionUpdateSchema = z.strictObject({
  status: z.enum(COLLECTION_STATUSES),
  count: countSchema,
  score: z.string().max(WRITE_LIMITS.label),
  price: z.number().int(),
  shop: z.string().trim().max(WRITE_LIMITS.shop),
  orderDate: z.iso.date().nullable(),
  paymentDate: z.iso.date().nullable(),
  shippingDate: z.iso.date().nullable(),
  collectionDate: z.iso.date().nullable(),
  shippingMethod: z.enum(SHIPPING_METHODS),
  tags: z.array(z.string().max(WRITE_LIMITS.tag)).max(WRITE_LIMITS.tags),
  notes: z.string().max(WRITE_LIMITS.notes),
  releaseId: z.string().max(WRITE_LIMITS.id).nullable(),
  condition: z.enum(CONDITIONS),
});

export type CollectionUpdateType = z.infer<typeof collectionUpdateSchema>;

export const collectionDeleteSchema = z.object({
  ids: idListSchema,
});
