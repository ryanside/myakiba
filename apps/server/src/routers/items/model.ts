import * as z from "zod";

export const itemReleaseSchema = z.object({
  id: z.string(),
  itemId: z.number(),
  date: z.string(),
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
  id: z.number(),
  category: z.string(),
  name: z.string(),
  role: z.string(),
});

export const itemParamSchema = z.object({ itemId: z.coerce.number() });

export type EntriesWithRoles = z.infer<typeof entriesWithRolesSchema>;
