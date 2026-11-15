import * as z from "zod";
import { CATEGORIES, CONDITIONS, SHIPPING_METHODS } from "@myakiba/contracts/shared/constants";
import { collectionSearchSortSchema } from "@myakiba/contracts/search/schema";
import { MAX_ADD_ROWS } from "@myakiba/contracts/add/constants";
import { itemIdField } from "@myakiba/contracts/add/schema";
import { COLLECTION_FIELD } from "@myakiba/contracts/collection/fields";
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

export const collectionUpdateSchema = z.strictObject(COLLECTION_FIELD);

export type CollectionUpdateType = z.infer<typeof collectionUpdateSchema>;

export const collectionDeleteSchema = z.object({
  ids: idListSchema,
});
