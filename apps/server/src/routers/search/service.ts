import { dbHttp } from "@/db";
import { collection, item, order } from "@/db/schema/figure";
import { like, eq } from "drizzle-orm";

class SearchService {
  async getSearchResults(search: string) {
    const [collectionResults, orderResults] = await dbHttp.batch([
      dbHttp
        .select({
          collectionId: collection.id,
          itemId: item.id,
          itemTitle: item.title,
          itemImage: item.image,
          itemCategory: item.category,
        })
        .from(collection)
        .innerJoin(item, eq(collection.itemId, item.id))
        .where(like(item.title, `%${search}%`)),
      dbHttp
        .select({
          orderId: order.id,
          orderTitle: order.title,
          orderStatus: order.status,
          orderShop: order.shop,
          orderReleaseMonthYear: order.releaseMonthYear,
        })
        .from(order)
        .where(like(order.title, `%${search}%`)),
    ]);
    return { collectionResults, orderResults };
  }
}

export default new SearchService();
