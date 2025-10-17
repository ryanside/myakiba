import * as z from "zod";

const commaSeparatedStringArray = z.preprocess((val) => {
  if (typeof val === "string" && val.length > 0) {
    return val.split(",");
  }
  return undefined;
}, z.array(z.string()).optional());

const commaSeparatedNumberArray = z.preprocess((val) => {
  if (typeof val === "string" && val.length > 0) {
    return val.split(",").map((v) => Number(v));
  }
  return undefined;
}, z.array(z.number()).optional());

const commaSeparatedShipMethodArray = z.preprocess(
  (val) => {
    if (typeof val === "string" && val.length > 0) {
      return val.split(",");
    }
    return undefined;
  },
  z
    .array(
      z.enum([
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
      ])
    )
    .optional()
);

const commaSeparatedConditionArray = z.preprocess(
  (val) => {
    if (typeof val === "string" && val.length > 0) {
      return val.split(",");
    }
    return undefined;
  },
  z.array(z.enum(["New", "Pre-Owned"])).optional()
);

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
      "releaseDate",
      "collectionDate",
      "createdAt",
    ])
    .optional()
    .default("createdAt"),
  order: z.enum(["asc", "desc"]).optional().default("desc"),
  search: z.string().optional(),
  paidMin: z.string().optional(),
  paidMax: z.string().optional(),
  shop: commaSeparatedStringArray,
  payDateStart: z.string().optional(),
  payDateEnd: z.string().optional(),
  shipDateStart: z.string().optional(),
  shipDateEnd: z.string().optional(),
  colDateStart: z.string().optional(),
  colDateEnd: z.string().optional(),
  shipMethod: commaSeparatedShipMethodArray,
  relDateStart: z.string().optional(),
  relDateEnd: z.string().optional(),
  relPriceMin: z.string().optional(),
  relPriceMax: z.string().optional(),
  relCurrency: commaSeparatedStringArray,
  category: commaSeparatedStringArray,
  entries: commaSeparatedNumberArray,
  scale: commaSeparatedStringArray,
  tags: commaSeparatedStringArray,
  condition: commaSeparatedConditionArray,
});

export const collectionParamSchema = z.object({
  id: z.string(),
});

export const collectionUpdateSchema = z.object({
  status: z.enum(["Owned", "Ordered", "Sold", "Paid", "Shipped"]),
  count: z.number(),
  score: z.string(),
  price: z.string(),
  shop: z.string(),
  orderDate: z.string().nullable(),
  paymentDate: z.string().nullable(),
  shippingDate: z.string().nullable(),
  collectionDate: z.string().nullable(),
  shippingMethod: z.enum([
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
  ]),
  tags: z.array(z.string()),
  notes: z.string(),
  releaseId: z.string().nullable(),
  releaseDate: z.string().nullable(),
  releasePrice: z.string().nullable(),
  releaseCurrency: z.string().nullable(),
  releaseBarcode: z.string().nullable(),
  releaseType: z.string().nullable(),
  condition: z.enum(["New", "Pre-Owned"]),
});

export type collectionUpdateType = z.infer<typeof collectionUpdateSchema>;

export const collectionDeleteSchema = z.object({
  ids: z.array(z.string()),
});
