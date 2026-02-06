import * as z from "zod";
import { CATEGORIES, COLLECTION_STATUSES, CONDITIONS, SHIPPING_METHODS } from "@myakiba/constants";

const commaSeparatedStringArray = z.preprocess((val) => {
  if (typeof val === "string" && val.length > 0) {
    return val.split(",");
  }
  return undefined;
}, z.array(z.string()).optional());

const commaSeparatedShipMethodArray = z.preprocess((val) => {
  if (typeof val === "string" && val.length > 0) {
    return val.split(",");
  }
  return undefined;
}, z.array(z.enum(SHIPPING_METHODS)).optional());

const commaSeparatedConditionArray = z.preprocess((val) => {
  if (typeof val === "string" && val.length > 0) {
    return val.split(",");
  }
  return undefined;
}, z.array(z.enum(CONDITIONS)).optional());

const commaSeparatedCategoryArray = z.preprocess((val) => {
  if (typeof val === "string" && val.length > 0) {
    return val.split(",");
  }
  return undefined;
}, z.array(z.enum(CATEGORIES)).optional());

export const collectionQuerySchema = z.object({
  limit: z.coerce.number().optional().default(10),
  offset: z.coerce.number().optional().default(0),
  sort: z
    .enum([
      "itemTitle",
      "itemCategory",
      "itemScale",
      "status",
      "count",
      "score",
      "price",
      "shop",
      "orderDate",
      "paymentDate",
      "shippingDate",
      "releaseDate",
      "collectionDate",
      "createdAt",
    ])
    .optional()
    .default("createdAt"),
  order: z.enum(["asc", "desc"]).optional().default("desc"),
  search: z.string().optional(),
  paidMin: z.coerce.number().int().optional(),
  paidMax: z.coerce.number().int().optional(),
  shop: commaSeparatedStringArray,
  payDateStart: z.iso.date().optional(),
  payDateEnd: z.iso.date().optional(),
  shipDateStart: z.iso.date().optional(),
  shipDateEnd: z.iso.date().optional(),
  colDateStart: z.iso.date().optional(),
  colDateEnd: z.iso.date().optional(),
  shipMethod: commaSeparatedShipMethodArray,
  relDateStart: z.iso.date().optional(),
  relDateEnd: z.iso.date().optional(),
  relPriceMin: z.coerce.number().int().optional(),
  relPriceMax: z.coerce.number().int().optional(),
  relCurrency: commaSeparatedStringArray,
  category: commaSeparatedCategoryArray,
  entries: commaSeparatedStringArray,
  scale: commaSeparatedStringArray,
  tags: commaSeparatedStringArray,
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

export type collectionUpdateType = z.infer<typeof collectionUpdateSchema>;

export const collectionDeleteSchema = z.object({
  ids: z.array(z.string()),
});
