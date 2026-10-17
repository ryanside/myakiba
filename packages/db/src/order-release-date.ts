import { and, eq, inArray, isNotNull, isNull, lt, max, or, sql } from "drizzle-orm";
import { collection, item_release, order } from "./schema/figure";
import type { Tx } from "./tx";

export async function advanceOrderReleaseDatesForCollectionItems(
  tx: Tx,
  collectionItemIds: readonly string[],
): Promise<void> {
  if (collectionItemIds.length === 0) return;

  const affectedOrderIds = tx
    .select({ orderId: collection.orderId })
    .from(collection)
    .where(and(inArray(collection.id, [...collectionItemIds]), isNotNull(collection.orderId)));

  const latestReleaseByOrder = tx
    .select({
      orderId: collection.orderId,
      releaseDate: max(item_release.date).as("latest_selected_release_date"),
    })
    .from(collection)
    .innerJoin(item_release, eq(collection.releaseId, item_release.id))
    .where(inArray(collection.orderId, affectedOrderIds))
    .groupBy(collection.orderId)
    .as("latest_release_by_order");

  await tx
    .update(order)
    .set({
      releaseDate: sql`${latestReleaseByOrder.releaseDate}`,
      updatedAt: new Date(),
    })
    .from(latestReleaseByOrder)
    .where(
      and(
        eq(order.id, latestReleaseByOrder.orderId),
        or(isNull(order.releaseDate), lt(order.releaseDate, latestReleaseByOrder.releaseDate)),
      ),
    );
}
