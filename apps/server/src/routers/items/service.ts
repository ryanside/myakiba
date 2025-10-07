import { db } from "@/db";
import { item, item_release } from "@/db/schema/figure";
import { eq } from "drizzle-orm";
import type { ItemReleasesResponse } from "./model";

class ItemService {
  async getItemReleases(itemId: number): Promise<ItemReleasesResponse> {
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

  async getItem(itemId: number) {
    const itemData = await db
      .select({
        id: item.id,
        title: item.title,
        category: item.category,
        version: item.version,
        scale: item.scale,
        height: item.height,
        width: item.width,
        depth: item.depth,
        image: item.image,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })
      .from(item)
      .where(eq(item.id, itemId))
      .limit(1);

    if (!itemData || itemData.length === 0) {
      throw new Error("ITEM_NOT_FOUND");
    }

    return itemData[0];
  }
}

export default new ItemService();
