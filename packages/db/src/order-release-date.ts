import { and, desc, eq, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { collection, item_release, order } from "./schema/figure";
import type { Tx } from "./tx";

/** Of two releases on one date, the less precise ranks later, since it shows no day. */
const precisionRank = sql`CASE ${item_release.datePrecision} WHEN 'year' THEN 2 WHEN 'month' THEN 1 ELSE 0 END`;

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
    .selectDistinctOn([collection.orderId], {
      orderId: collection.orderId,
      releaseDate: sql<string>`${item_release.date}`.as("latest_selected_release_date"),
      precision: sql<string>`${item_release.datePrecision}`.as("latest_selected_release_precision"),
    })
    .from(collection)
    .innerJoin(item_release, eq(collection.releaseId, item_release.id))
    .where(inArray(collection.orderId, affectedOrderIds))
    .orderBy(collection.orderId, desc(item_release.date), desc(precisionRank))
    .as("latest_release_by_order");

  await tx
    .update(order)
    .set({
      releaseDate: sql`${latestReleaseByOrder.releaseDate}`,
      releaseDatePrecision: sql`${latestReleaseByOrder.precision}`,
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
