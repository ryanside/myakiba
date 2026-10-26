import * as z from "zod";
import {
  internalCsvItemSchema,
  jobDataSchema,
  syncPriceWarningSchema,
} from "@myakiba/contracts/sync/schema";
import { normalizeCsvPrices } from "./csv";

const retainedCsv = z.looseObject({
  type: z.literal("csv"),
  items: z.array(internalCsvItemSchema),
  warnings: z.array(syncPriceWarningSchema).optional(),
});

// Remove price reconstruction once pre-normalization payloads have aged out (30-day retention).
export const storedJobDataSchema = z.preprocess((input) => {
  const current = jobDataSchema.safeParse(input);
  if (current.success) return current.data;
  const legacy = retainedCsv.safeParse(input);
  if (!legacy.success) return input;
  const normalized = normalizeCsvPrices(legacy.data.items);
  return {
    ...legacy.data,
    items: normalized.items,
    warnings: legacy.data.warnings ?? normalized.warnings,
  };
}, jobDataSchema);
