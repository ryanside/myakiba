import { sql } from "drizzle-orm";
import * as z from "zod";
import { syncSession, syncSessionItem } from "@myakiba/db/schema/figure";
import type { SyncSessionItemStatus } from "@myakiba/contracts/shared/types";
import {
  csvJobDataSchema,
  internalCsvItemSchema,
  jobDataSchema,
} from "@myakiba/contracts/sync/schema";
import { normalizeCsvPrices } from "./csv";

// Remove once no Import History record from before this release remains (30-day retention).
export const storedItemStatus = sql<SyncSessionItemStatus>`case when ${syncSessionItem.status} = 'scraped' then 'imported' else ${syncSessionItem.status} end`;

// Bun/Drizzle has also persisted payloads as JSON strings; project both stored forms alike.
export const storedRequestPayload = sql`case when jsonb_typeof(${syncSession.requestPayload}) = 'string'
  and pg_input_is_valid(${syncSession.requestPayload} #>> '{}', 'jsonb')
  then (${syncSession.requestPayload} #>> '{}')::jsonb else ${syncSession.requestPayload} end`;

export const storedLegacyCsvPayload =
  sql<unknown>`case when ${storedRequestPayload}->>'type' = 'csv'
  and jsonb_path_exists(${storedRequestPayload}, '$.items[*] ? (!(exists(@.priceMinorUnits)))')
  then ${storedRequestPayload} else null end`.mapWith(syncSession.requestPayload);

const queued = z.looseObject({ itemsToScrape: z.unknown().optional() });
const retained = z.looseObject({ order: queued.optional(), collection: queued.optional() });
const csvPrices = z.object({
  type: z.literal("csv"),
  items: z.array(z.object({ priceMinorUnits: z.number().optional() })),
});
const rawCsv = csvJobDataSchema.extend({
  items: z.array(internalCsvItemSchema.extend({ priceMinorUnits: z.never().optional() })),
});

// Remove once no Import History record from before this release remains (30-day retention).
export const storedJobDataSchema = z.preprocess((input) => {
  const parsed = retained.safeParse(input);
  if (!parsed.success) return input;
  const value = parsed.data;
  const legacyQueue =
    (value.order && "itemsToScrape" in value.order) ||
    (value.collection && "itemsToScrape" in value.collection);
  const prices = csvPrices.safeParse(input);
  const legacyCsv =
    prices.success && prices.data.items.some((item) => item.priceMinorUnits === undefined);
  if (!legacyQueue && !legacyCsv) return input;
  const normalize = (items: z.infer<typeof queued>) => ({
    ...items,
    itemsToFetch: items.itemsToFetch ?? items.itemsToScrape,
  });
  const renamed = {
    ...value,
    ...(value.order && { order: normalize(value.order) }),
    ...(value.collection && { collection: normalize(value.collection) }),
  };
  if (!legacyCsv) return renamed;
  const csv = rawCsv.safeParse(renamed);
  if (!csv.success) return renamed;
  const normalized = normalizeCsvPrices(csv.data.items);
  return { ...csv.data, ...normalized };
}, jobDataSchema);

export function storedSessionWarnings({
  storedWarnings,
  legacyPayload,
}: {
  readonly storedWarnings: unknown;
  readonly legacyPayload: unknown;
}) {
  if (legacyPayload !== null) {
    const payload = storedJobDataSchema.safeParse(legacyPayload);
    return payload.success && payload.data.type === "csv" ? payload.data.warnings : [];
  }
  const parsed = csvJobDataSchema.pick({ warnings: true }).safeParse({ warnings: storedWarnings });
  return parsed.success ? parsed.data.warnings : [];
}
