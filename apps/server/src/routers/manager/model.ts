import { z } from "zod";
import { createUpdateSchema } from "drizzle-zod";
import { collection } from "@/db/schema/figure";

export const collectionUpdateSchema = createUpdateSchema(collection);

export type collectionUpdateType = z.infer<typeof collectionUpdateSchema>;

export const managerQuerySchema = z.object({
  limit: z.coerce.number().optional().default(10),
  offset: z.coerce.number().optional().default(0),
  paid: z.array(z.string()).optional(),
  shop: z
    .union([z.string(), z.array(z.string())])
    .transform((val) => (Array.isArray(val) ? val : [val]))
    .optional(),
  payDate: z.array(z.string()).optional(),
  shipDate: z.array(z.string()).optional(),
  colDate: z.array(z.string()).optional(),
  shipMethod: z
    .union([
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
      ]),
      z.array(
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
      ),
    ])
    .transform((val) => (Array.isArray(val) ? val : [val]))
    .optional(),
  relDate: z.array(z.string()).optional(),
  relPrice: z.array(z.string()).optional(),
  relCurrency: z
    .union([z.string(), z.array(z.string())])
    .transform((val) => (Array.isArray(val) ? val : [val]))
    .optional(),
  category: z
    .union([z.string(), z.array(z.string())])
    .transform((val) => (Array.isArray(val) ? val : [val]))
    .optional(),
  entries: z
    .union([z.string(), z.array(z.string())])
    .transform((val) => (Array.isArray(val) ? val : [val]))
    .optional(),
  scale: z
    .union([z.string(), z.array(z.string())])
    .transform((val) => (Array.isArray(val) ? val : [val]))
    .optional(),
  tags: z
    .union([z.string(), z.array(z.string())])
    .transform((val) => (Array.isArray(val) ? val : [val]))
    .optional(),
  condition: z
    .union([
      z.enum(["New", "Pre-Owned"]),
      z.array(z.enum(["New", "Pre-Owned"])),
    ])
    .transform((val) => (Array.isArray(val) ? val : [val]))
    .optional(),
  sort: z
    .enum([
      "release",
      "paid",
      "price",
      "score",
      "payDate",
      "shipDate",
      "colDate",
      "createdAt",
      "height",
      "scale",
      "shop",
      "count",
    ])
    .optional()
    .default("createdAt"),
  order: z.enum(["asc", "desc"]).optional().default("desc"),
  search: z.string().optional(),
});

export const managerParamSchema = z.object({
  id: z.string(),
});

export const managerUpdateSchema = z.object({
  status: z.enum(["Owned", "Ordered", "Sold"]),
  count: z.number(),
  score: z.string(),
  price: z.string(),
  shop: z.string(),
  paymentDate: z.string(),
  shippingDate: z.string(),
  collectionDate: z.string(),
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
  shippingFee: z.string(),
  condition: z.enum(["New", "Pre-Owned"]),
  notes: z.string(),
  releaseId: z.string(),
});

export const managerDeleteSchema = z.object({
  ids: z.array(z.string()),
});
