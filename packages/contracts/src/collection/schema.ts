import * as z from "zod";
import { CATEGORIES, CONDITIONS, SHIPPING_METHODS } from "../shared/constants";
import { collectionSearchSortSchema, sortDirectionSchema } from "../search/schema";

export const collectionSearchSchema = z.object({
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().min(0).optional(),
  sort: collectionSearchSortSchema.optional(),
  order: sortDirectionSchema.optional(),
  search: z.string().optional(),
  paidMin: z.coerce.number().int().optional(),
  paidMax: z.coerce.number().int().optional(),
  shop: z.array(z.string()).optional(),
  payDateStart: z.iso.date().optional(),
  payDateEnd: z.iso.date().optional(),
  shipDateStart: z.iso.date().optional(),
  shipDateEnd: z.iso.date().optional(),
  colDateStart: z.iso.date().optional(),
  colDateEnd: z.iso.date().optional(),
  shipMethod: z.array(z.enum(SHIPPING_METHODS)).optional(),
  relDateStart: z.iso.date().optional(),
  relDateEnd: z.iso.date().optional(),
  relPriceMin: z.coerce.number().int().optional(),
  relPriceMax: z.coerce.number().int().optional(),
  relCurrency: z.array(z.string()).optional(),
  category: z.array(z.enum(CATEGORIES)).optional(),
  entries: z.array(z.string()).optional(),
  scale: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  condition: z.array(z.enum(CONDITIONS)).optional(),
});

export type CollectionFilters = z.infer<typeof collectionSearchSchema>;
