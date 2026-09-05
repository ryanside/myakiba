import { db } from "@myakiba/db/client";
import { collection, item, list, listMember, order } from "@myakiba/db/schema/figure";
import type { ListInput, ListTarget } from "@myakiba/contracts/lists/schema";
import type { PositionOrderInput } from "@myakiba/contracts/shared/position-order";
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import { planPositionOrderMove, POSITION_UPDATE_CHUNK_SIZE } from "@/lib/position-order";

const LIST_MEMBER_INSERT_CHUNK_SIZE = 5000;

class ListsService {
  async getLists(userId: string, limit: number, offset: number) {
    const [items, countRows] = await Promise.all([
      db
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
              candidate.sort_key
            FROM (
              SELECT id, position, item_id, collection_id, order_id
              FROM "list_member"
              WHERE list_id = "list".id
              ORDER BY position, id
              LIMIT 20
            ) list_member_row
            CROSS JOIN LATERAL (
              SELECT item_record.image, item_record.id AS sort_key
              FROM item item_record
              WHERE item_record.id = list_member_row.item_id
                AND item_record.image IS NOT NULL

              UNION ALL

              SELECT collection_item.image, collection_member.id AS sort_key
              FROM "collection" collection_member
              INNER JOIN item collection_item ON collection_item.id = collection_member.item_id
              WHERE collection_member.id = list_member_row.collection_id
                AND collection_item.image IS NOT NULL

              UNION ALL

              SELECT order_item.image, order_collection.id AS sort_key
              FROM "collection" order_collection
              INNER JOIN item order_item ON order_item.id = order_collection.item_id
              WHERE order_collection.order_id = list_member_row.order_id
                AND order_item.image IS NOT NULL
            ) candidate
            ORDER BY
              candidate.image,
              list_member_row.position,
              list_member_row.id,
              candidate.sort_key
          ) preview
          ORDER BY preview.position, preview.member_id, preview.sort_key
          LIMIT 4
        )`,
          createdAt: list.createdAt,
          updatedAt: list.updatedAt,
        })
        .from(list)
        .where(eq(list.userId, userId))
        .orderBy(asc(list.position), asc(list.createdAt), asc(list.id))
        .limit(limit)
        .offset(offset),
      db
        .select({ totalCount: sql<number>`COUNT(*)::integer` })
        .from(list)
        .where(eq(list.userId, userId)),
    ]);

    return { items, totalCount: countRows[0]?.totalCount ?? 0, limit, offset };
  }

  async createList(userId: string, input: ListInput) {
    return db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`lists:${userId}`}, 0))`,
      );

      const positions = await tx
        .select({ position: sql<number>`COALESCE(MAX(${list.position}), -1)::integer` })
        .from(list)
        .where(eq(list.userId, userId));
      const created = await tx
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

      return created[0];
    });
  }

  async updateList(userId: string, listId: string, input: ListInput) {
    const updated = await db
      .update(list)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(list.id, listId), eq(list.userId, userId)))
      .returning({
        id: list.id,
        title: list.title,
        description: list.description,
        createdAt: list.createdAt,
        updatedAt: list.updatedAt,
      });

    if (updated.length === 0) throw new Error("LIST_NOT_FOUND");
    return updated[0];
  }

  async deleteLists(userId: string, listIds: readonly string[]) {
    return db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`lists:${userId}`}, 0))`,
      );
      const deleted = await tx
        .delete(list)
        .where(and(eq(list.userId, userId), inArray(list.id, listIds)))
        .returning({ id: list.id });

      if (deleted.length !== listIds.length) throw new Error("LIST_NOT_FOUND");
      return deleted;
    });
  }

  async moveLists(userId: string, { movedIds, anchorId, placement }: PositionOrderInput) {
    return db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`lists:${userId}`}, 0))`,
      );
      const currentLists = await tx
        .select({ id: list.id, position: list.position })
        .from(list)
        .where(eq(list.userId, userId))
        .orderBy(asc(list.position), asc(list.createdAt), asc(list.id))
        .for("update");

      const plan = planPositionOrderMove(currentLists, movedIds, anchorId, placement);
      if (plan.kind === "not_found") throw new Error("LIST_NOT_FOUND");

      if (plan.updates.length > 0) {
        const positionCases = plan.updates.map(
          (update) => sql`WHEN ${update.id} THEN ${update.position}`,
        );
        await tx
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
    });
  }

  async getList(userId: string, listId: string) {
    const rows = await db
      .select({
        id: list.id,
        title: list.title,
        description: list.description,
        createdAt: list.createdAt,
        updatedAt: list.updatedAt,
      })
      .from(list)
      .where(and(eq(list.id, listId), eq(list.userId, userId)))
      .limit(1);

    const row = rows[0];
    if (!row) throw new Error("LIST_NOT_FOUND");
    return row;
  }

  async getListMembers(userId: string, listId: string, limit: number, offset: number) {
    return db.transaction(
      async (tx) => {
        const [ownedLists, memberRows, countRows] = await Promise.all([
          tx
            .select({ id: list.id })
            .from(list)
            .where(and(eq(list.id, listId), eq(list.userId, userId)))
            .limit(1),
          tx
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
          tx
            .select({ totalCount: sql<number>`COUNT(*)::integer` })
            .from(listMember)
            .innerJoin(list, eq(listMember.listId, list.id))
            .where(and(eq(listMember.listId, listId), eq(list.userId, userId))),
        ]);

        if (ownedLists.length === 0) throw new Error("LIST_NOT_FOUND");
        const totalCount = countRows[0]?.totalCount ?? 0;

        const itemIds = memberRows.flatMap((member) => (member.itemId ? [member.itemId] : []));
        const collectionIds = memberRows.flatMap((member) =>
          member.collectionId ? [member.collectionId] : [],
        );
        const orderIds = memberRows.flatMap((member) => (member.orderId ? [member.orderId] : []));

        const [items, collectionItems, orders] = await Promise.all([
          itemIds.length === 0
            ? Promise.resolve([])
            : tx
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
            : tx
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
            : tx
                .select({
                  id: order.id,
                  title: order.title,
                  images: sql<string[]>`ARRAY(
                SELECT DISTINCT order_item.image
                FROM "collection" order_collection
                INNER JOIN item order_item ON order_item.id = order_collection.item_id
                WHERE order_collection.order_id = "order".id
                  AND order_item.image IS NOT NULL
                ORDER BY order_item.image
                LIMIT 4
              )`,
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

        return { items: members, totalCount, limit, offset };
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  }

  async getListOptionsForTargets(userId: string, targets: readonly ListTarget[]) {
    const itemIds = targets.flatMap((target) => (target.type === "item" ? [target.id] : []));
    const collectionIds = targets.flatMap((target) =>
      target.type === "collectionItem" ? [target.id] : [],
    );
    const orderIds = targets.flatMap((target) => (target.type === "order" ? [target.id] : []));

    const [itemRows, collectionRows, orderRows] = await Promise.all([
      itemIds.length > 0
        ? db.select({ id: item.id }).from(item).where(inArray(item.id, itemIds))
        : Promise.resolve([]),
      collectionIds.length > 0
        ? db
            .select({ id: collection.id })
            .from(collection)
            .where(and(eq(collection.userId, userId), inArray(collection.id, collectionIds)))
        : Promise.resolve([]),
      orderIds.length > 0
        ? db
            .select({ id: order.id })
            .from(order)
            .where(and(eq(order.userId, userId), inArray(order.id, orderIds)))
        : Promise.resolve([]),
    ]);

    if (
      itemRows.length !== itemIds.length ||
      collectionRows.length !== collectionIds.length ||
      orderRows.length !== orderIds.length
    ) {
      throw new Error("LIST_TARGET_NOT_FOUND");
    }

    const targetFilters = [
      itemIds.length > 0 ? inArray(listMember.itemId, itemIds) : null,
      collectionIds.length > 0 ? inArray(listMember.collectionId, collectionIds) : null,
      orderIds.length > 0 ? inArray(listMember.orderId, orderIds) : null,
    ].filter((filter) => filter !== null);
    const [firstTargetFilter, ...remainingTargetFilters] = targetFilters;
    if (!firstTargetFilter) throw new Error("LIST_TARGET_NOT_FOUND");
    const targetFilter = or(firstTargetFilter, ...remainingTargetFilters) ?? firstTargetFilter;

    return db
      .select({
        id: list.id,
        title: list.title,
        memberCount: sql<number>`COUNT(${listMember.id})::integer`,
      })
      .from(list)
      .leftJoin(listMember, and(eq(listMember.listId, list.id), targetFilter))
      .where(eq(list.userId, userId))
      .groupBy(list.id, list.title, list.position, list.createdAt)
      .orderBy(asc(list.position), asc(list.createdAt), asc(list.id));
  }

  async addTargetsToLists(
    userId: string,
    targets: readonly ListTarget[],
    listIds: readonly string[],
  ) {
    return db.transaction(async (tx) => {
      const itemIds = targets.flatMap((target) => (target.type === "item" ? [target.id] : []));
      const collectionIds = targets.flatMap((target) =>
        target.type === "collectionItem" ? [target.id] : [],
      );
      const orderIds = targets.flatMap((target) => (target.type === "order" ? [target.id] : []));

      const [itemRows, collectionRows, orderRows, ownedLists] = await Promise.all([
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
        tx
          .select({ id: list.id })
          .from(list)
          .where(and(eq(list.userId, userId), inArray(list.id, listIds)))
          .orderBy(asc(list.id))
          .for("update"),
      ]);

      if (
        itemRows.length !== itemIds.length ||
        collectionRows.length !== collectionIds.length ||
        orderRows.length !== orderIds.length
      ) {
        throw new Error("LIST_TARGET_NOT_FOUND");
      }
      if (ownedLists.length !== listIds.length) throw new Error("LIST_NOT_FOUND");

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
        // oxlint-disable-next-line no-await-in-loop -- Keep chunked inserts atomic and sequential within one transaction.
        const addedMembers = await tx
          .insert(listMember)
          .values(members)
          .onConflictDoNothing()
          .returning({ id: listMember.id });
        addedCount += addedMembers.length;
      }

      return { listIds: [...listIds], addedCount };
    });
  }

  async removeTargetsFromList(userId: string, listId: string, targets: readonly ListTarget[]) {
    return db.transaction(async (tx) => {
      const ownedLists = await tx
        .select({ id: list.id })
        .from(list)
        .where(and(eq(list.id, listId), eq(list.userId, userId)))
        .limit(1)
        .for("update");

      if (ownedLists.length === 0) throw new Error("LIST_NOT_FOUND");

      const itemIds = targets.flatMap((target) => (target.type === "item" ? [target.id] : []));
      const collectionIds = targets.flatMap((target) =>
        target.type === "collectionItem" ? [target.id] : [],
      );
      const orderIds = targets.flatMap((target) => (target.type === "order" ? [target.id] : []));
      const targetFilters = [
        itemIds.length > 0 ? inArray(listMember.itemId, itemIds) : null,
        collectionIds.length > 0 ? inArray(listMember.collectionId, collectionIds) : null,
        orderIds.length > 0 ? inArray(listMember.orderId, orderIds) : null,
      ].filter((filter) => filter !== null);
      const [firstTargetFilter, ...remainingTargetFilters] = targetFilters;
      if (!firstTargetFilter) {
        return { listId, removedCount: 0 };
      }
      const targetFilter = or(firstTargetFilter, ...remainingTargetFilters) ?? firstTargetFilter;
      const removedMembers = await tx
        .delete(listMember)
        .where(and(eq(listMember.listId, listId), targetFilter))
        .returning({ id: listMember.id });

      return { listId, removedCount: removedMembers.length };
    });
  }

  async removeMembers(userId: string, listId: string, memberIds: readonly string[]) {
    return db.transaction(async (tx) => {
      const ownedLists = await tx
        .select({ id: list.id })
        .from(list)
        .where(and(eq(list.id, listId), eq(list.userId, userId)))
        .limit(1)
        .for("update");

      if (ownedLists.length === 0) throw new Error("LIST_MEMBER_NOT_FOUND");

      const deletedMembers = await tx
        .delete(listMember)
        .where(and(eq(listMember.listId, listId), inArray(listMember.id, memberIds)))
        .returning({ id: listMember.id });

      if (deletedMembers.length !== memberIds.length) throw new Error("LIST_MEMBER_NOT_FOUND");

      return { removedCount: deletedMembers.length };
    });
  }

  async moveMembers(
    userId: string,
    listId: string,
    { movedIds, anchorId, placement }: PositionOrderInput,
  ) {
    return db.transaction(async (tx) => {
      const ownedLists = await tx
        .select({ id: list.id })
        .from(list)
        .where(and(eq(list.id, listId), eq(list.userId, userId)))
        .limit(1)
        .for("update");

      if (ownedLists.length === 0) throw new Error("LIST_NOT_FOUND");

      const currentMembers = await tx
        .select({ id: listMember.id, position: listMember.position })
        .from(listMember)
        .where(eq(listMember.listId, listId))
        .orderBy(asc(listMember.position), asc(listMember.id))
        .for("update");

      const plan = planPositionOrderMove(currentMembers, movedIds, anchorId, placement);
      if (plan.kind === "not_found") throw new Error("LIST_MEMBER_NOT_FOUND");

      for (let index = 0; index < plan.updates.length; index += POSITION_UPDATE_CHUNK_SIZE) {
        const updates = plan.updates.slice(index, index + POSITION_UPDATE_CHUNK_SIZE);
        const positionCases = updates.map(
          (update) => sql`WHEN ${update.id} THEN ${update.position}`,
        );
        // oxlint-disable-next-line no-await-in-loop -- Keep chunked position updates sequential within one transaction.
        await tx
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
    });
  }
}

export default new ListsService();
