import { sql } from "drizzle-orm";
import * as z from "zod";
import { syncSessionItem } from "@myakiba/db/schema/figure";
import type { SyncSessionItemStatus } from "@myakiba/contracts/shared/types";
import {
  csvJobDataSchema,
  internalCsvItemSchema,
  jobDataSchema,
} from "@myakiba/contracts/sync/schema";
import { normalizeCsvPrices } from "./csv";

// Remove once no Import History record from before this release remains (30-day retention).
export const storedItemStatus = sql<SyncSessionItemStatus>`case when ${syncSessionItem.status} = 'scraped' then 'imported' else ${syncSessionItem.status} end`;

const queued = z.looseObject({ itemsToScrape: z.unknown().optional() });
const retained = z.looseObject({ order: queued.optional(), collection: queued.optional() });
const rawCsv = csvJobDataSchema.extend({
  items: z.array(internalCsvItemSchema.extend({ priceMinorUnits: z.never().optional() })),
});

// Remove once no Import History record from before this release remains (30-day retention).
export const storedJobDataSchema = z.preprocess((input) => {
  const parsed = retained.safeParse(input);
  if (!parsed.success) return input;
  const value = parsed.data;
  const normalize = (items: z.infer<typeof queued>) => ({
    ...items,
    itemsToFetch: items.itemsToFetch ?? items.itemsToScrape,
  });
  const renamed = {
    ...value,
    ...(value.order && { order: normalize(value.order) }),
    ...(value.collection && { collection: normalize(value.collection) }),
  };
  const current = jobDataSchema.safeParse(renamed);
  if (current.success) return current.data;
  const csv = rawCsv.safeParse(renamed);
  if (!csv.success) return renamed;
  const prices = normalizeCsvPrices(csv.data.items);
  return { ...csv.data, ...prices };
}, jobDataSchema);
