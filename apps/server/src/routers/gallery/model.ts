import { z } from "zod";

export const galleryQuerySchema = z.object({
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
  group: z
    .enum([
      "Origins",
      "Characters",
      "Companies",
      "Artists",
      "Classifications",
      "category",
      "scale",
      "release",
      "score",
    ])
    .optional(),
  root: z.enum(["Figures", "Goods", "Media"]).optional().default("Figures"),
});

export const galleryItemSchema = z.object({
  collectionId: z.string(),
  itemId: z.number(),
  image: z.string().nullable(),
  title: z.string(),
  category: z.string().nullable(),
  scale: z.string().nullable(),
  score: z.string().nullable(),
  releaseDate: z.string().nullable(),
  releasePrice: z.string().nullable(),
  releaseCurrency: z.string().nullable(),
});

export const galleryGroupSchema = z.object({
  groupName: z.string(),
  groupCategory: z.string(),
  count: z.number(),
  items: z.array(galleryItemSchema),
});

export const galleryUngroupedResponseSchema = z.object({
  items: z.array(galleryItemSchema),
  totalItems: z.number(),
  groupBy: z.null(),
});

export const galleryGroupedResponseSchema = z.object({
  groups: z.array(galleryGroupSchema),
  totalGroups: z.number(),
  groupBy: z.string(),
});

export const galleryResponseSchema = z.union([
  galleryUngroupedResponseSchema,
  galleryGroupedResponseSchema,
]);

export const groupingTypeSchema = z.enum([
  "Origins",
  "Characters",
  "Companies",
  "Artists",
  "Classifications",
  "category",
  "scale",
  "release",
  "score",
]);

export type GalleryItem = z.infer<typeof galleryItemSchema>;
export type GalleryGroup = z.infer<typeof galleryGroupSchema>;
export type GalleryResponse = z.infer<typeof galleryResponseSchema>;
export type GroupingType = z.infer<typeof groupingTypeSchema>;
