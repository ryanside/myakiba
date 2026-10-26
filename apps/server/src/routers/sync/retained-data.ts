import { sql } from "drizzle-orm";
import * as z from "zod";
import { syncSessionItem } from "@myakiba/db/schema/figure";
import type { SyncSessionItemStatus } from "@myakiba/contracts/shared/types";
import { jobDataSchema } from "@myakiba/contracts/sync/schema";

// Remove once no row from before this release remains (30-day retention).
export const storedItemStatus = sql<SyncSessionItemStatus>`case when ${syncSessionItem.status} = 'scraped' then 'imported' else ${syncSessionItem.status} end`;

const legacyItems = z.looseObject({ itemsToScrape: z.unknown().optional() });
const retained = z.looseObject({
  order: legacyItems.optional(),
  collection: legacyItems.optional(),
});

// Remove once no row from before this release remains (30-day retention).
export const storedJobDataSchema = z.preprocess((input) => {
  const parsed = retained.safeParse(input);
  if (!parsed.success) return input;
  const value = parsed.data;
  const normalize = (items: z.infer<typeof legacyItems>) => ({
    ...items,
    itemsToFetch: items.itemsToFetch ?? items.itemsToScrape,
  });
  return {
    ...value,
    ...(value.order && { order: normalize(value.order) }),
    ...(value.collection && { collection: normalize(value.collection) }),
  };
}, jobDataSchema);
