import * as z from "zod";
import { CATEGORIES } from "@myakiba/constants/categories";
import { ENTRY_CATEGORIES } from "@myakiba/constants/enums";

export const customItemReleaseSchema = z.object({
  date: z.iso.date(),
  type: z.string().nullable().optional(),
  price: z.string().nullable().optional(),
  priceCurrency: z.string().nullable().optional(),
  barcode: z.string().nullable().optional(),
});

export const customItemEntrySchema = z
  .object({
    entryId: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    category: z.enum(ENTRY_CATEGORIES),
    role: z.string().optional(),
  })
  .refine((value) => Boolean(value.entryId || value.name), {
    message: "Entry name is required when entryId is not provided",
    path: ["name"],
  });

export const customItemSchema = z.object({
  title: z.string().min(1),
  category: z.enum(CATEGORIES),
  version: z.array(z.string()).optional(),
  scale: z.string().optional(),
  height: z.number().int().nonnegative().optional(),
  width: z.number().int().nonnegative().optional(),
  depth: z.number().int().nonnegative().optional(),
  image: z.string().nullable().optional(),
  releases: z.array(customItemReleaseSchema).optional(),
  entries: z.array(customItemEntrySchema).optional(),
});

export type CustomItemInput = z.infer<typeof customItemSchema>;

export const itemReleaseSchema = z.object({
  id: z.string(),
  itemId: z.string(),
  date: z.iso.date(),
  type: z.string().nullable(),
  price: z.string().nullable(),
  priceCurrency: z.string().nullable(),
  barcode: z.string().nullable(),
});

export type ItemRelease = z.infer<typeof itemReleaseSchema>;

export const itemReleasesResponseSchema = z.object({
  releases: z.array(itemReleaseSchema),
});

export type ItemReleasesResponse = z.infer<typeof itemReleasesResponseSchema>;

export const entriesWithRolesSchema = z.object({
  id: z.string(),
  category: z.string(),
  name: z.string(),
  role: z.string(),
});

export const itemParamSchema = z.object({ itemId: z.string().min(1) });

export type EntriesWithRoles = z.infer<typeof entriesWithRolesSchema>;
