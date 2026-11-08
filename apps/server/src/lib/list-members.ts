import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { Result } from "better-result";
import { collection, item, list, listMember, order } from "@myakiba/db/schema/figure";
import type { ReadTx, Tx } from "@myakiba/db/tx";
import type { ListTarget } from "@myakiba/contracts/lists/schema";
import { ListOrSelectionNotFound } from "@/lib/errors/list-or-selection-not-found";

const LIST_MEMBER_INSERT_CHUNK_SIZE = 5000;

export function splitTargets(targets: readonly ListTarget[]) {
  return {
    itemIds: targets.flatMap((target) => (target.type === "item" ? [target.id] : [])),
    collectionIds: targets.flatMap((target) =>
      target.type === "collectionItem" ? [target.id] : [],
    ),
    orderIds: targets.flatMap((target) => (target.type === "order" ? [target.id] : [])),
  };
}

export async function canTarget(
  tx: ReadTx,
  userId: string,
  { itemIds, collectionIds, orderIds }: ReturnType<typeof splitTargets>,
) {
  const [itemRows, collectionRows, orderRows] = await Promise.all([
    itemIds.length > 0
      ? tx.select({ id: item.id }).from(item).where(inArray(item.id, itemIds))
      : Promise.resolve([]),
    collectionIds.length > 0
      ? tx
          .select({ id: collection.id })
          .from(collection)
          .where(and(eq(collection.userId, userId), inArray(collection.id, collectionIds)))
      : Promise.resolve([]),
    orderIds.length > 0
      ? tx
          .select({ id: order.id })
          .from(order)
          .where(and(eq(order.userId, userId), inArray(order.id, orderIds)))
      : Promise.resolve([]),
  ]);
  return (
    itemRows.length === itemIds.length &&
    collectionRows.length === collectionIds.length &&
    orderRows.length === orderIds.length
  );
}

/** Locks the viewer's Lists in id order, answering whether the viewer owns every one. */
export async function lockOwnedLists(tx: Tx, userId: string, listIds: readonly string[]) {
  const owned = await tx
    .select({ id: list.id })
    .from(list)
    .where(and(eq(list.userId, userId), inArray(list.id, listIds)))
    .orderBy(asc(list.id))
    .for("update");
  return owned.length === listIds.length;
}

export async function addListMembers(
  tx: Tx,
  userId: string,
  targets: readonly ListTarget[],
  listIds: readonly string[],
): Promise<Result<{ addedCount: number }, ListOrSelectionNotFound>> {
  const [found, ownsLists] = await Promise.all([
    canTarget(tx, userId, splitTargets(targets)),
    lockOwnedLists(tx, userId, listIds),
  ]);
  if (!found || !ownsLists) {
    return Result.err(new ListOrSelectionNotFound());
  }

  const maxPositions = await tx
    .select({
      listId: listMember.listId,
      position: sql<number>`COALESCE(MAX(${listMember.position}), -1)::integer`,
    })
    .from(listMember)
    .where(inArray(listMember.listId, listIds))
    .groupBy(listMember.listId);
  const maxPositionByListId = new Map(
    maxPositions.map((position) => [position.listId, position.position]),
  );
  const membersToInsert = listIds.flatMap((listId) => {
    const maxPosition = maxPositionByListId.get(listId) ?? -1;
    return targets.map((target, index) => ({
      listId,
      itemId: target.type === "item" ? target.id : null,
      collectionId: target.type === "collectionItem" ? target.id : null,
      orderId: target.type === "order" ? target.id : null,
      position: maxPosition + index + 1,
    }));
  });
  let addedCount = 0;
  for (let index = 0; index < membersToInsert.length; index += LIST_MEMBER_INSERT_CHUNK_SIZE) {
    const members = membersToInsert.slice(index, index + LIST_MEMBER_INSERT_CHUNK_SIZE);
    const addedMembers = await tx
      .insert(listMember)
      .values(members)
      .onConflictDoNothing()
      .returning({ id: listMember.id });
    addedCount += addedMembers.length;
  }
  return Result.ok({ addedCount });
}
