import { db } from "@/db";
import { item_release } from "@/db/schema/figure";
import { eq } from "drizzle-orm";
import type { ItemReleasesResponse } from "./model";

export async function getItemReleases(
  itemId: number
): Promise<ItemReleasesResponse> {
  const releases = await db
    .select({
      id: item_release.id,
      itemId: item_release.itemId,
      date: item_release.date,
      type: item_release.type,
      price: item_release.price,
      priceCurrency: item_release.priceCurrency,
      barcode: item_release.barcode,
    })
    .from(item_release)
    .where(eq(item_release.itemId, itemId))
    .orderBy(item_release.date);

  if (!releases) {
    throw new Error("FAILED_TO_GET_ITEM_RELEASES");
  }

  return {
    releases,
  };
}
