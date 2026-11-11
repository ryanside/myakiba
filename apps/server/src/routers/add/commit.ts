import { createId } from "@paralleldrive/cuid2";
import { and, eq, inArray, sql } from "drizzle-orm";
import { Result, panic } from "better-result";
import { releasePriceDefault } from "@myakiba/contracts/add/schema";
import type { AddCommitResponse } from "@myakiba/contracts/add/schema";
import type { ListTarget } from "@myakiba/contracts/lists/schema";
import { advanceOrderReleaseDatesForCollectionItems } from "@myakiba/db/order-release-date";
import { collection, item, item_release, order } from "@myakiba/db/schema/figure";
import type { Tx } from "@myakiba/db/tx";
import type { ListOrSelectionNotFound } from "@/lib/errors/list-or-selection-not-found";
import { latestRelease } from "@/lib/latest-release";
import { addListMembers, lockOwnedLists } from "@/lib/list-members";
import { appendToWishlist } from "@/lib/wishlist-append";
import { OrderNotFound } from "@/routers/orders/errors/order-not-found";
import { ItemsMissing } from "./errors/items-missing";
import { ReleaseNotOfItem } from "@/lib/errors/release-not-of-item";
import { guardedWrite } from "@/lib/owner-guard";
import type { AddChoices, AddOwnership, AddRow } from "./model";

type CollectionInsert = typeof collection.$inferInsert;

/** The fields an owned row takes from where it goes, before its own price, score, tags and notes. */
type Placement = {
  readonly orderId: string | null;
  readonly fields: (row: AddRow) => Omit<CollectionInsert, "userId" | "itemId">;
};

const orderTerms = {
  id: order.id,
  status: order.status,
  shop: order.shop,
  orderDate: order.orderDate,
  paymentDate: order.paymentDate,
  shippingDate: order.shippingDate,
  collectionDate: order.collectionDate,
  shippingMethod: order.shippingMethod,
};

async function orderTermsOf(
  tx: Tx,
  userId: string,
  target: Extract<AddOwnership, { kind: "order" }>["order"],
) {
  if (target.kind === "existing") {
    const [found] = await tx
      .select(orderTerms)
      .from(order)
      .where(and(eq(order.id, target.orderId), eq(order.userId, userId)))
      .for("update");
    return found;
  }
  const [created] = await tx
    .insert(order)
    .values({ userId, ...target.fields })
    .returning(orderTerms);
  if (!created)
    panic("Inserting the new order returned no row, so add.commit has no order to add to");
  return created;
}

async function placementOf(
  tx: Tx,
  userId: string,
  ownership: AddOwnership,
): Promise<Result<Placement | null, OrderNotFound>> {
  switch (ownership.kind) {
    case "none":
      return Result.ok(null);
    case "collection": {
      const { shared } = ownership;
      return Result.ok({
        orderId: null,
        fields: (row) => ({
          status: "Owned",
          shop: row.shop ?? shared.shop,
          orderDate: row.orderDate,
          paymentDate: row.paymentDate,
          shippingDate: row.shippingDate,
          // A row's own date wins even when it is null, which clears the shared date for that row.
          collectionDate:
            row.collectionDate === undefined ? shared.collectionDate : row.collectionDate,
          shippingMethod: row.shippingMethod ?? shared.shippingMethod,
          condition: row.condition ?? shared.condition,
          count: row.count ?? shared.count,
        }),
      });
    }
    case "order": {
      const terms = await orderTermsOf(tx, userId, ownership.order);
      if (!terms) return Result.err(new OrderNotFound());
      const { id, ...inherited } = terms;
      return Result.ok({
        orderId: id,
        fields: (row) => ({
          ...inherited,
          orderId: id,
          condition: row.condition,
          count: row.count,
        }),
      });
    }
  }
}

export async function writeCommit(
  tx: Tx,
  userId: string,
  choices: AddChoices,
  currency: string,
): Promise<
  Result<
    AddCommitResponse,
    ItemsMissing | ReleaseNotOfItem | OrderNotFound | ListOrSelectionNotFound
  >
> {
  const itemIds = choices.rows.map((row) => row.itemId);
  const release = latestRelease(tx);
  // KEY SHARE makes a concurrent delete of these items wait for this commit.
  const found = await tx
    .select({
      id: item.id,
      externalId: item.externalId,
      title: item.title,
      image: item.image,
      releaseId: release.id,
      releasePrice: release.price,
      releaseCurrency: release.priceCurrency,
    })
    .from(item)
    .leftJoinLateral(release, sql`TRUE`)
    .where(and(eq(item.ownerId, userId), inArray(item.id, itemIds)))
    .for("key share", { of: item });
  const itemById = new Map(found.map((row) => [row.id, row]));
  const chosenIds = choices.rows.flatMap(({ releaseId }) => (releaseId ? [releaseId] : []));
  const chosenReleases =
    chosenIds.length === 0
      ? []
      : await tx
          .select({
            id: item_release.id,
            itemId: item_release.itemId,
            price: item_release.price,
            priceCurrency: item_release.priceCurrency,
          })
          .from(item_release)
          .innerJoin(item, eq(item.id, item_release.itemId))
          .where(and(eq(item.ownerId, userId), inArray(item_release.id, chosenIds)));
  const chosenById = new Map(chosenReleases.map((chosen) => [chosen.id, chosen]));
  const picked = [];
  for (const row of choices.rows) {
    const summary = itemById.get(row.itemId);
    if (!summary) return Result.err(new ItemsMissing());
    const chosen = row.releaseId ? chosenById.get(row.releaseId) : undefined;
    if (row.releaseId && chosen?.itemId !== row.itemId) return Result.err(new ReleaseNotOfItem());
    picked.push({ row, summary, chosen });
  }

  // Lists lock before the Order, as Lists.addTargets locks Lists before its members' Orders.
  // addListMembers checks that the viewer owns them once the rows exist.
  if (choices.listIds.length > 0) await lockOwnedLists(tx, userId, choices.listIds);

  const placement = await placementOf(tx, userId, choices.ownership);
  if (placement.isErr()) return placement;
  const place = placement.value;

  const entries = picked.map(({ row, summary, chosen }) => ({
    summary,
    collectionItem: place
      ? {
          ...place.fields(row),
          id: createId(),
          userId,
          itemId: summary.id,
          releaseId: chosen?.id ?? summary.releaseId,
          price:
            row.price ??
            releasePriceDefault(
              chosen ?? { price: summary.releasePrice, priceCurrency: summary.releaseCurrency },
              currency,
            ),
          score: row.score,
          tags: row.tags,
          notes: row.notes,
        }
      : null,
  }));
  const collectionItems = entries.flatMap(({ collectionItem }) =>
    collectionItem ? [collectionItem] : [],
  );
  const committed = entries.map(({ summary, collectionItem }) => ({
    itemId: summary.id,
    externalId: summary.externalId,
    title: summary.title,
    image: summary.image,
    collectionId: collectionItem?.id ?? null,
  }));

  if (collectionItems.length > 0) {
    const inserted = await guardedWrite(tx.insert(collection).values(collectionItems), {
      collection_release_of_item: () => new ReleaseNotOfItem(),
    });
    if (inserted.isErr()) return Result.err(inserted.error);
    if (place?.orderId) {
      await advanceOrderReleaseDatesForCollectionItems(
        tx,
        collectionItems.map(({ id }) => id),
      );
    }
  }

  let wishlistAdded = 0;
  if (choices.wishlist) {
    const added = await appendToWishlist(tx, userId, itemIds);
    if (added.isErr()) return Result.err(new ItemsMissing());
    wishlistAdded = added.value;
  }

  if (choices.listIds.length > 0) {
    const targets: ListTarget[] = committed.map((row) =>
      row.collectionId
        ? { type: "collectionItem", id: row.collectionId }
        : { type: "item", id: row.itemId },
    );
    const listed = await addListMembers(tx, userId, targets, choices.listIds);
    if (listed.isErr()) return listed;
  }

  return Result.ok({
    committed,
    orderId: place?.orderId ?? null,
    wishlistAdded,
    listIds: choices.listIds,
  });
}
