import * as z from "zod";

export const itemReleaseSchema = z.object({
  id: z.string(),
  itemId: z.string(),
  date: z.iso.date(),
  type: z.string().nullable(),
  price: z.number().int().nullable(),
  priceCurrency: z.string().nullable(),
  barcode: z.string().nullable(),
});

export const itemReleasesResponseSchema = z.object({
  releases: z.array(itemReleaseSchema),
});

export type ItemRelease = z.infer<typeof itemReleaseSchema>;
export type ItemReleasesResponse = z.infer<typeof itemReleasesResponseSchema>;
