import { desc, inArray } from "drizzle-orm";
import { item_release } from "@myakiba/db/schema/figure";
import type { ReadTx } from "@myakiba/db/tx";

type LatestRelease = {
  readonly id: string;
  readonly date: string;
  readonly price: number | null;
  readonly priceCurrency: string | null;
};

export async function latestReleases(
  tx: ReadTx,
  itemIds: readonly string[],
): Promise<ReadonlyMap<string, LatestRelease>> {
  if (itemIds.length === 0) return new Map();

  const rows = await tx
    .selectDistinctOn([item_release.itemId], {
      itemId: item_release.itemId,
      id: item_release.id,
      date: item_release.date,
      price: item_release.price,
      priceCurrency: item_release.priceCurrency,
    })
    .from(item_release)
    .where(inArray(item_release.itemId, [...itemIds]))
    .orderBy(
      item_release.itemId,
      desc(item_release.date),
      desc(item_release.createdAt),
      desc(item_release.id),
    );
  return new Map(rows.map(({ itemId, ...release }) => [itemId, release]));
}
