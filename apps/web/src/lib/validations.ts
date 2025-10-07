import * as z from "zod";

export const searchSchema = z.object({
  limit: z.coerce.number().optional(),
  offset: z.coerce.number().optional(),
  sort: z
    .enum([
      "title",
      "shop",
      "orderDate",
      "releaseMonthYear",
      "shippingMethod",
      "total",
      "itemCount",
      "createdAt",
    ])
    .optional(),
  order: z.enum(["asc", "desc"]).optional(),
  search: z.string().optional(),
});

export const collectionSearchSchema = z.object({
  limit: z.coerce.number().optional(),
  offset: z.coerce.number().optional(),
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
      "releaseDate",
      "collectionDate",
      "createdAt",
    ])
    .optional(),
  order: z.enum(["asc", "desc"]).optional(),
  search: z.string().optional(),
  paidMin: z.string().optional(),
  paidMax: z.string().optional(),
  shop: z.array(z.string()).optional(),
  payDateStart: z.string().optional(),
  payDateEnd: z.string().optional(),
  shipDateStart: z.string().optional(),
  shipDateEnd: z.string().optional(),
  colDateStart: z.string().optional(),
  colDateEnd: z.string().optional(),
  shipMethod: z.array(z.enum([
    "n/a",
    "EMS",
    "SAL",
    "AIRMAIL",
    "SURFACE",
    "FEDEX",
    "DHL",
    "Colissimo",
    "UPS",
    "Domestic",
  ])).optional(),
  relDateStart: z.string().optional(),
  relDateEnd: z.string().optional(),
  relPriceMin: z.string().optional(),
  relPriceMax: z.string().optional(),
  relCurrency: z.array(z.string()).optional(),
  category: z.array(z.string()).optional(),
  entries: z.array(z.coerce.number()).optional(),
  scale: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  condition: z.array(z.enum(["New", "Pre-Owned"])).optional(),
});
