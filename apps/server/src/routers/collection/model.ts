import * as z from "zod";
import { CATEGORIES, COLLECTION_STATUSES, CONDITIONS, SHIPPING_METHODS } from "@myakiba/constants";
import {
  collectionSearchSchema,
  collectionSearchSortSchema,
  commaSeparatedStringArraySchema,
  createCommaSeparatedEnumArraySchema,
  sortDirectionSchema,
} from "@myakiba/schemas";

const commaSeparatedShipMethodArray = createCommaSeparatedEnumArraySchema(SHIPPING_METHODS);
const commaSeparatedConditionArray = createCommaSeparatedEnumArraySchema(CONDITIONS);
const commaSeparatedCategoryArray = createCommaSeparatedEnumArraySchema(CATEGORIES);

export const collectionQuerySchema = collectionSearchSchema.extend({
  limit: z.coerce.number().optional().default(10),
  offset: z.coerce.number().optional().default(0),
  sort: collectionSearchSortSchema.optional().default("createdAt"),
  order: sortDirectionSchema.optional().default("desc"),
  shop: commaSeparatedStringArraySchema,
  shipMethod: commaSeparatedShipMethodArray,
  relCurrency: commaSeparatedStringArraySchema,
  category: commaSeparatedCategoryArray,
  entries: commaSeparatedStringArraySchema,
  scale: commaSeparatedStringArraySchema,
  tags: commaSeparatedStringArraySchema,
  condition: commaSeparatedConditionArray,
});

export const collectionParamSchema = z.object({
  id: z.string(),
});

export const collectionUpdateSchema = z.object({
  status: z.enum(COLLECTION_STATUSES),
  count: z.number(),
  score: z.string(),
  price: z.number().int(),
  shop: z.string(),
  orderDate: z.iso.date().nullable(),
  paymentDate: z.iso.date().nullable(),
  shippingDate: z.iso.date().nullable(),
  collectionDate: z.iso.date().nullable(),
  shippingMethod: z.enum(SHIPPING_METHODS),
  tags: z.array(z.string()),
  notes: z.string(),
  releaseId: z.string().nullable(),
  releaseDate: z.iso.date().nullable(),
  releasePrice: z.number().int().nullable(),
  releaseCurrency: z.string().nullable(),
  releaseBarcode: z.string().nullable(),
  releaseType: z.string().nullable(),
  condition: z.enum(CONDITIONS),
});

export type CollectionUpdateType = z.infer<typeof collectionUpdateSchema>;

export const collectionDeleteSchema = z.object({
  ids: z.array(z.string()),
});
