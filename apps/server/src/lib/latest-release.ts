import { desc, eq } from "drizzle-orm";
import { item, item_release } from "@myakiba/db/schema/figure";
import type { ReadTx } from "@myakiba/db/tx";

export function latestRelease(tx: ReadTx) {
  return tx
    .select({
      id: item_release.id,
      date: item_release.date,
      type: item_release.type,
      barcode: item_release.barcode,
      price: item_release.price,
      priceCurrency: item_release.priceCurrency,
    })
    .from(item_release)
    .where(eq(item_release.itemId, item.id))
    .orderBy(desc(item_release.date), desc(item_release.createdAt), desc(item_release.id))
    .limit(1)
    .as("latest_release");
}
