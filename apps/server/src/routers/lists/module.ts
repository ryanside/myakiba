import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import { collection, item, list, listMember, order } from "@myakiba/db/schema/figure";
import type { ReadTx, Tx } from "@myakiba/db/tx";
import type { ListInput, ListTarget } from "@myakiba/contracts/lists/schema";
import type { PositionOrderInput } from "@myakiba/contracts/shared/position-order";
import { orderPreviewImagesSql } from "@/lib/order-preview";
import { planPositionOrderMove, POSITION_UPDATE_CHUNK_SIZE } from "@/lib/position-order";
import { command, fail, ok, query } from "@/domain/kernel";

const LIST_MEMBER_INSERT_CHUNK_SIZE = 5000;

const listOrder = [asc(list.position), asc(list.createdAt), asc(list.id)];

function lockLists(tx: Tx, userId: string) {
  return tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`lists:${userId}`}, 0))`);
}

function splitTargets(targets: readonly ListTarget[]) {
  return {
    itemIds: targets.flatMap((target) => (target.type === "item" ? [target.id] : [])),
    collectionIds: targets.flatMap((target) =>
      target.type === "collectionItem" ? [target.id] : [],
    ),
    orderIds: targets.flatMap((target) => (target.type === "order" ? [target.id] : [])),
  };
}

function memberTargetFilter({ itemIds, collectionIds, orderIds }: ReturnType<typeof splitTargets>) {
  const [first, ...rest] = [
    itemIds.length > 0 ? inArray(listMember.itemId, itemIds) : null,
    collectionIds.length > 0 ? inArray(listMember.collectionId, collectionIds) : null,
    orderIds.length > 0 ? inArray(listMember.orderId, orderIds) : null,
  ].filter((filter) => filter !== null);
  if (!first) return null;
  return or(first, ...rest) ?? first;
}

/** Whether every target exists and the caller owns each Collection Item and Order. */
async function targetsExist(
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

async function ownedListForUpdate(tx: Tx, userId: string, listId: string) {
  const [owned] = await tx
    .select({ id: list.id })
    .from(list)
    .where(and(eq(list.id, listId), eq(list.userId, userId)))
    .limit(1)
    .for("update");
  return owned;
}

export const Lists = {
  list: query(
    { action: "lists.list", failure: "Failed to get lists" },
    async (scope, input: { readonly limit: number; readonly offset: number }) => {
      const userId = scope.viewer.userId;
      const [items, countRows] = await Promise.all([
        scope.tx
          .select({
            id: list.id,
            title: list.title,
            description: list.description,
            position: list.position,
            images: sql<string[]>`ARRAY(
          SELECT preview.image
          FROM (
            SELECT DISTINCT ON (candidate.image)
              candidate.image,
              list_member_row.position,
              list_member_row.id AS member_id,
              candidate.created_at,
              candidate.sort_key
            FROM (
              SELECT id, position, item_id, collection_id, order_id
              FROM "list_member"
              WHERE list_id = "list".id
              ORDER BY position, id
              LIMIT 20
            ) list_member_row
            CROSS JOIN LATERAL (
              SELECT item_record.image, item_record.created_at, item_record.id AS sort_key
              FROM item item_record
              WHERE item_record.id = list_member_row.item_id
                AND item_record.image IS NOT NULL

              UNION ALL

              SELECT collection_item.image, collection_member.created_at, collection_member.id AS sort_key
              FROM "collection" collection_member
              INNER JOIN item collection_item ON collection_item.id = collection_member.item_id
              WHERE collection_member.id = list_member_row.collection_id
                AND collection_item.image IS NOT NULL

              UNION ALL

              SELECT order_item.image, order_collection.created_at, order_collection.id AS sort_key
              FROM "collection" order_collection
              INNER JOIN item order_item ON order_item.id = order_collection.item_id
              WHERE order_collection.order_id = list_member_row.order_id
                AND order_item.image IS NOT NULL
            ) candidate
            ORDER BY
              candidate.image,
              list_member_row.position,
              list_member_row.id,
              candidate.created_at DESC,
              candidate.sort_key DESC
          ) preview
          ORDER BY preview.position, preview.member_id, preview.created_at DESC, preview.sort_key DESC
          LIMIT 4
        )`,
            createdAt: list.createdAt,
            updatedAt: list.updatedAt,
          })
          .from(list)
          .where(eq(list.userId, userId))
          .orderBy(...listOrder)
          .limit(input.limit)
          .offset(input.offset),
        scope.tx
          .select({ totalCount: sql<number>`COUNT(*)::integer` })
          .from(list)
          .where(eq(list.userId, userId)),
      ]);

      scope.log.set({ lists: { resultCount: items.length } });
      return ok({
        items: items.map((currentList) => ({
          ...currentList,
          createdAt: currentList.createdAt.toISOString(),
          updatedAt: currentList.updatedAt.toISOString(),
        })),
        totalCount: countRows[0]?.totalCount ?? 0,
        limit: input.limit,
        offset: input.offset,
      });
    },
  ),

  create: command(
    { action: "lists.create", failure: "Failed to create list" },
    async (scope, input: ListInput) => {
      const userId = scope.viewer.userId;
      await lockLists(scope.tx, userId);

      const positions = await scope.tx
        .select({ position: sql<number>`COALESCE(MAX(${list.position}), -1)::integer` })
        .from(list)
        .where(eq(list.userId, userId));
      const [created] = await scope.tx
        .insert(list)
        .values({ userId, ...input, position: (positions[0]?.position ?? -1) + 1 })
        .returning({
          id: list.id,
          title: list.title,
          description: list.description,
          position: list.position,
          createdAt: list.createdAt,
          updatedAt: list.updatedAt,
        });
      if (!created) throw new Error("FAILED_TO_CREATE_LIST");

      scope.log.set({ list: { id: created.id } });
      return ok({
        ...created,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      });
    },
  ),

  move: command(
    { action: "lists.order.move", failure: "Failed to move lists" },
    async (scope, { movedIds, anchorId, placement }: PositionOrderInput) => {
      const userId = scope.viewer.userId;
      scope.log.set({ listCount: movedIds.length });
      await lockLists(scope.tx, userId);
      const currentLists = await scope.tx
        .select({ id: list.id, position: list.position })
        .from(list)
        .where(eq(list.userId, userId))
        .orderBy(...listOrder)
        .for("update");

      const plan = planPositionOrderMove(currentLists, movedIds, anchorId, placement);
      if (plan.kind === "not_found") return fail("not_found", "List not found");

      if (plan.updates.length > 0) {
        const positionCases = plan.updates.map(
          (update) => sql`WHEN ${update.id} THEN ${update.position}`,
        );
        await scope.tx
          .update(list)
          .set({
            position: sql<number>`CASE ${list.id} ${sql.join(positionCases, sql.raw(" "))} ELSE ${list.position} END`,
          })
          .where(
            and(
              eq(list.userId, userId),
              inArray(
                list.id,
                plan.updates.map((row) => row.id),
              ),
            ),
          );
      }

      return ok("List order saved");
    },
  ),

  targetOptions: query(
    { action: "lists.targets.options", failure: "Failed to get List options" },
    async (scope, input: { readonly targets: readonly ListTarget[] }) => {
      const userId = scope.viewer.userId;
      scope.log.set({ targetCount: input.targets.length });
      const targets = splitTargets(input.targets);
      if (!(await targetsExist(scope.tx, userId, targets))) {
        return fail("not_found", "Selection not found");
      }
      const targetFilter = memberTargetFilter(targets);
      if (!targetFilter) return fail("not_found", "Selection not found");

      const lists = await scope.tx
        .select({
          id: list.id,
          title: list.title,
          memberCount: sql<number>`COUNT(${listMember.id})::integer`,
        })
        .from(list)
        .leftJoin(listMember, and(eq(listMember.listId, list.id), targetFilter))
        .where(eq(list.userId, userId))
        .groupBy(list.id, list.title, list.position, list.createdAt)
        .orderBy(...listOrder);

      scope.log.set({ lists: { resultCount: lists.length } });
      return ok({ lists });
    },
  ),

  addTargets: command(
    { action: "lists.targets.add", failure: "Failed to add to Lists" },
    async (
      scope,
      input: { readonly targets: readonly ListTarget[]; readonly listIds: readonly string[] },
    ) => {
      const userId = scope.viewer.userId;
      const { targets, listIds } = input;
      scope.log.set({ targetCount: targets.length, listCount: listIds.length });

      const [found, ownedLists] = await Promise.all([
        targetsExist(scope.tx, userId, splitTargets(targets)),
        scope.tx
          .select({ id: list.id })
          .from(list)
          .where(and(eq(list.userId, userId), inArray(list.id, listIds)))
          .orderBy(asc(list.id))
          .for("update"),
      ]);
      if (!found || ownedLists.length !== listIds.length) {
        return fail("not_found", "List or selection not found");
      }

      const maxPositions = await scope.tx
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
        const addedMembers = await scope.tx
          .insert(listMember)
          .values(members)
          .onConflictDoNothing()
          .returning({ id: listMember.id });
        addedCount += addedMembers.length;
      }

      scope.log.set({ addedCount });
      return ok({ listIds: [...listIds], addedCount });
    },
  ),

  removeTargets: command(
    { action: "lists.targets.remove", failure: "Failed to remove from List" },
    async (scope, input: { readonly listId: string; readonly targets: readonly ListTarget[] }) => {
      const { listId } = input;
      scope.log.set({ list: { id: listId }, targetCount: input.targets.length });
      if (!(await ownedListForUpdate(scope.tx, scope.viewer.userId, listId))) {
        return fail("not_found", "List not found");
      }

      const targetFilter = memberTargetFilter(splitTargets(input.targets));
      if (!targetFilter) {
        scope.log.set({ removedCount: 0 });
        return ok({ listId, removedCount: 0 });
      }
      const removedMembers = await scope.tx
        .delete(listMember)
        .where(and(eq(listMember.listId, listId), targetFilter))
        .returning({ id: listMember.id });

      scope.log.set({ removedCount: removedMembers.length });
      return ok({ listId, removedCount: removedMembers.length });
    },
  ),

  get: query(
    { action: "lists.get", failure: "Failed to get list" },
    async (scope, input: { readonly listId: string }) => {
      scope.log.set({ list: { id: input.listId } });
      const [row] = await scope.tx
        .select({
          id: list.id,
          title: list.title,
          description: list.description,
          createdAt: list.createdAt,
          updatedAt: list.updatedAt,
        })
        .from(list)
        .where(and(eq(list.id, input.listId), eq(list.userId, scope.viewer.userId)))
        .limit(1);
      if (!row) return fail("not_found", "List not found");

      return ok({
        ...row,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      });
    },
  ),

  update: command(
    { action: "lists.update", failure: "Failed to update list" },
    async (scope, input: { readonly listId: string; readonly list: ListInput }) => {
      scope.log.set({ list: { id: input.listId } });
      const [updated] = await scope.tx
        .update(list)
        .set({ ...input.list, updatedAt: new Date() })
        .where(and(eq(list.id, input.listId), eq(list.userId, scope.viewer.userId)))
        .returning({
          id: list.id,
          title: list.title,
          description: list.description,
          createdAt: list.createdAt,
          updatedAt: list.updatedAt,
        });
      if (!updated) return fail("not_found", "List not found");

      return ok({
        ...updated,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      });
    },
  ),

  remove: command(
    { action: "lists.delete", failure: "Failed to delete lists" },
    async (scope, input: { readonly listIds: readonly string[] }) => {
      const userId = scope.viewer.userId;
      scope.log.set({ listCount: input.listIds.length });
      await lockLists(scope.tx, userId);
      const deleted = await scope.tx
        .delete(list)
        .where(and(eq(list.userId, userId), inArray(list.id, input.listIds)))
        .returning({ id: list.id });
      if (deleted.length !== input.listIds.length) return fail("not_found", "List not found");

      return ok({ deletedCount: input.listIds.length });
    },
  ),

  removeMembers: command(
    { action: "lists.members.remove", failure: "Failed to remove from List" },
    async (scope, input: { readonly listId: string; readonly memberIds: readonly string[] }) => {
      const { listId, memberIds } = input;
      scope.log.set({ list: { id: listId }, memberCount: memberIds.length });
      if (!(await ownedListForUpdate(scope.tx, scope.viewer.userId, listId))) {
        return fail("not_found", "Selection not found");
      }

      const deletedMembers = await scope.tx
        .delete(listMember)
        .where(and(eq(listMember.listId, listId), inArray(listMember.id, memberIds)))
        .returning({ id: listMember.id });
      if (deletedMembers.length !== memberIds.length) {
        return fail("not_found", "Selection not found");
      }

      scope.log.set({ removedCount: deletedMembers.length });
      return ok({ removedCount: deletedMembers.length });
    },
  ),

  members: query(
    { action: "lists.members.list", failure: "Failed to load List", snapshot: true },
    async (
      scope,
      input: { readonly listId: string; readonly limit: number; readonly offset: number },
    ) => {
      const userId = scope.viewer.userId;
      const { listId, limit, offset } = input;
      scope.log.set({ list: { id: listId } });
      const [ownedLists, memberRows, countRows] = await Promise.all([
        scope.tx
          .select({ id: list.id })
          .from(list)
          .where(and(eq(list.id, listId), eq(list.userId, userId)))
          .limit(1),
        scope.tx
          .select({
            id: listMember.id,
            itemId: listMember.itemId,
            collectionId: listMember.collectionId,
            orderId: listMember.orderId,
            position: listMember.position,
          })
          .from(listMember)
          .innerJoin(list, eq(listMember.listId, list.id))
          .where(and(eq(listMember.listId, listId), eq(list.userId, userId)))
          .orderBy(asc(listMember.position), asc(listMember.id))
          .limit(limit)
          .offset(offset),
        scope.tx
          .select({ totalCount: sql<number>`COUNT(*)::integer` })
          .from(listMember)
          .innerJoin(list, eq(listMember.listId, list.id))
          .where(and(eq(listMember.listId, listId), eq(list.userId, userId))),
      ]);
      if (ownedLists.length === 0) return fail("not_found", "List not found");
      const totalCount = countRows[0]?.totalCount ?? 0;

      const itemIds = memberRows.flatMap((member) => (member.itemId ? [member.itemId] : []));
      const collectionIds = memberRows.flatMap((member) =>
        member.collectionId ? [member.collectionId] : [],
      );
      const orderIds = memberRows.flatMap((member) => (member.orderId ? [member.orderId] : []));

      const [items, collectionItems, orders] = await Promise.all([
        itemIds.length === 0
          ? Promise.resolve([])
          : scope.tx
              .select({
                id: item.id,
                externalId: item.externalId,
                title: item.title,
                image: item.image,
              })
              .from(item)
              .where(inArray(item.id, itemIds)),
        collectionIds.length === 0
          ? Promise.resolve([])
          : scope.tx
              .select({
                id: collection.id,
                itemId: item.id,
                itemExternalId: item.externalId,
                title: item.title,
                image: item.image,
              })
              .from(collection)
              .innerJoin(item, eq(collection.itemId, item.id))
              .where(and(eq(collection.userId, userId), inArray(collection.id, collectionIds))),
        orderIds.length === 0
          ? Promise.resolve([])
          : scope.tx
              .select({
                id: order.id,
                title: order.title,
                images: sql<string[]>`(${orderPreviewImagesSql})[1:4]`,
              })
              .from(order)
              .where(and(eq(order.userId, userId), inArray(order.id, orderIds))),
      ]);

      const itemById = new Map(items.map((currentItem) => [currentItem.id, currentItem]));
      const collectionItemById = new Map(
        collectionItems.map((collectionItem) => [collectionItem.id, collectionItem]),
      );
      const orderById = new Map(orders.map((currentOrder) => [currentOrder.id, currentOrder]));

      const members = memberRows.map((member) => {
        if (member.itemId) {
          const target = itemById.get(member.itemId);
          if (!target) throw new Error("LIST_MEMBER_TARGET_NOT_FOUND");
          return {
            id: member.id,
            position: member.position,
            type: "item" as const,
            targetId: target.id,
            title: target.title,
            image: target.image,
            itemExternalId: target.externalId,
          };
        }

        if (member.collectionId) {
          const target = collectionItemById.get(member.collectionId);
          if (!target) throw new Error("LIST_MEMBER_TARGET_NOT_FOUND");
          return {
            id: member.id,
            position: member.position,
            type: "collectionItem" as const,
            targetId: target.id,
            title: target.title,
            image: target.image,
            itemId: target.itemId,
            itemExternalId: target.itemExternalId,
          };
        }

        if (!member.orderId) throw new Error("LIST_MEMBER_TARGET_NOT_FOUND");
        const target = orderById.get(member.orderId);
        if (!target) throw new Error("LIST_MEMBER_TARGET_NOT_FOUND");
        return {
          id: member.id,
          position: member.position,
          type: "order" as const,
          targetId: target.id,
          title: target.title,
          images: target.images,
        };
      });

      scope.log.set({ lists: { resultCount: members.length } });
      return ok({ items: members, totalCount, limit, offset });
    },
  ),

  moveMembers: command(
    { action: "lists.members.order.move", failure: "Failed to save List order" },
    async (scope, input: PositionOrderInput & { readonly listId: string }) => {
      const { listId, movedIds, anchorId, placement } = input;
      scope.log.set({ list: { id: listId }, memberCount: movedIds.length });
      if (!(await ownedListForUpdate(scope.tx, scope.viewer.userId, listId))) {
        return fail("not_found", "List or selection not found");
      }

      const currentMembers = await scope.tx
        .select({ id: listMember.id, position: listMember.position })
        .from(listMember)
        .where(eq(listMember.listId, listId))
        .orderBy(asc(listMember.position), asc(listMember.id))
        .for("update");

      const plan = planPositionOrderMove(currentMembers, movedIds, anchorId, placement);
      if (plan.kind === "not_found") return fail("not_found", "List or selection not found");

      for (let index = 0; index < plan.updates.length; index += POSITION_UPDATE_CHUNK_SIZE) {
        const updates = plan.updates.slice(index, index + POSITION_UPDATE_CHUNK_SIZE);
        const positionCases = updates.map(
          (update) => sql`WHEN ${update.id} THEN ${update.position}`,
        );
        await scope.tx
          .update(listMember)
          .set({
            position: sql<number>`CASE ${listMember.id} ${sql.join(positionCases, sql.raw(" "))} ELSE ${listMember.position} END`,
          })
          .where(
            and(
              eq(listMember.listId, listId),
              inArray(
                listMember.id,
                updates.map((row) => row.id),
              ),
            ),
          );
      }

      return ok("List order saved");
    },
  ),
};
