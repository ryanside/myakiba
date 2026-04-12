import * as z from "zod";
import { ANALYTICS_SECTIONS, DEFAULT_LIMIT } from "@myakiba/contracts/shared/constants";

export const analyticsSectionParamSchema = z.object({
  sectionName: z.enum(ANALYTICS_SECTIONS),
});

export const analyticsSectionQuerySchema = z.object({
  search: z.string().trim().optional(),
  limit: z.coerce.number().int().positive().optional().default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export const analyticsSectionItemsQuerySchema = z.object({
  match: z.string().min(1),
  limit: z.coerce.number().int().positive().optional().default(6),
  offset: z.coerce.number().int().min(0).optional().default(0),
});
