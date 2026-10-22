import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import { advanceOrderReleaseDatesForCollectionItems } from "@myakiba/db/order-release-date";
import { collection, entry, entry_to_item, item, item_release } from "@myakiba/db/schema/figure";
import type { Tx } from "@myakiba/db/tx";
import { mfcReleaseId } from "@myakiba/mfc/parse";
import type { MfcEntryLink, MfcItemPage } from "@myakiba/mfc/parse";
import { itemFields, linkEntries, linksInLockOrder, releaseRows } from "@/lib/mfc-item-page";
import { buildReleasePlan } from "./release-plan";
import type { ReleasePlan } from "./release-plan";

export async function lockItem(tx: Tx, itemId: string) {
  const [locked] = await tx
    .select({
      id: item.id,
      title: item.title,
      mfcTitle: item.mfcTitle,
      numbering: item.numbering,
      category: item.category,
      version: item.version,
      scale: item.scale,
      height: item.height,
      width: item.width,
      depth: item.depth,
      mfcMetadataVersion: item.mfcMetadataVersion,
      contentLabel: item.contentLabel,
      mfcRatingId: item.mfcRatingId,
      image: item.image,
    })
    .from(item)
    .where(eq(item.id, itemId))
    .for("update");
  return locked;
}

type LockedItem = NonNullable<Awaited<ReturnType<typeof lockItem>>>;

function storedLinks(tx: Tx, itemId: string) {
  return tx
    .select({
      externalId: entry.externalId,
      category: entry.category,
      name: entry.name,
      sourceLabel: entry_to_item.sourceLabel,
      roles: entry_to_item.roles,
      materialPercentage: entry_to_item.materialPercentage,
    })
    .from(entry_to_item)
    .innerJoin(entry, eq(entry.id, entry_to_item.entryId))
    .where(eq(entry_to_item.itemId, itemId))
    .orderBy(asc(entry.externalId));
}

type Link = Awaited<ReturnType<typeof storedLinks>>[number];

function pageLink(link: MfcEntryLink): Link {
  return {
    externalId: link.externalId,
    category: link.category,
    name: link.name,
    sourceLabel: link.sourceLabel,
    roles: [...link.roles],
    materialPercentage: link.materialPercentage,
  };
}

type Snapshot = {
  readonly fields: Omit<LockedItem, "id">;
  readonly links: readonly Link[];
  readonly releaseIds: readonly string[];
};

async function storedSnapshot(tx: Tx, locked: LockedItem): Promise<Snapshot> {
  const { id, ...fields } = locked;
  const links = await storedLinks(tx, id);
  const releases = await tx
    .select({ id: item_release.id })
    .from(item_release)
    .where(eq(item_release.itemId, id))
    .orderBy(asc(item_release.id));
  return { fields, links, releaseIds: releases.map((release) => release.id) };
}

function pageSnapshot(page: MfcItemPage, image: string | null): Snapshot {
  return {
    fields: { ...itemFields(page), image },
    links: linksInLockOrder(page).map(pageLink),
    releaseIds: page.releases.map((release) => mfcReleaseId(page.mfcItemId, release)).toSorted(),
  };
}

async function applyReleases(
  tx: Tx,
  itemId: string,
  page: MfcItemPage,
  existingReleaseIds: readonly string[],
): Promise<ReleasePlan["kind"]> {
  const rows = releaseRows(itemId, page);
  const plan = buildReleasePlan({
    existingReleaseIds,
    pageReleaseIds: rows.map((release) => release.id),
  });
  if (rows.length > 0) {
    await tx
      .insert(item_release)
      .values(rows)
      .onConflictDoNothing({ target: [item_release.id] });
  }

  switch (plan.kind) {
    case "none":
      break;
    case "remap": {
      const remapped = await tx
        .update(collection)
        .set({ releaseId: plan.toReleaseId, updatedAt: new Date() })
        .where(and(eq(collection.itemId, itemId), eq(collection.releaseId, plan.fromReleaseId)))
        .returning({ id: collection.id });
      await advanceOrderReleaseDatesForCollectionItems(
        tx,
        remapped.map(({ id }) => id),
      );
      break;
    }
    case "clear":
      await tx
        .update(collection)
        .set({ releaseId: null, updatedAt: new Date() })
        .where(
          and(
            eq(collection.itemId, itemId),
            isNotNull(collection.releaseId),
            inArray(collection.releaseId, [...plan.staleReleaseIds]),
          ),
        );
      break;
  }

  if (plan.staleReleaseIds.length > 0) {
    await tx
      .delete(item_release)
      .where(
        and(eq(item_release.itemId, itemId), inArray(item_release.id, [...plan.staleReleaseIds])),
      );
  }
  return plan.kind;
}

export async function refreshItem(
  tx: Tx,
  locked: LockedItem,
  page: MfcItemPage,
  image: string | null,
): Promise<ReleasePlan["kind"] | "unchanged"> {
  const current = await storedSnapshot(tx, locked);
  if (Bun.deepEquals(current, pageSnapshot(page, image))) return "unchanged";

  await tx
    .update(item)
    .set({ ...itemFields(page), image, updatedAt: new Date() })
    .where(eq(item.id, locked.id));
  await tx.delete(entry_to_item).where(eq(entry_to_item.itemId, locked.id));
  await linkEntries(tx, locked.id, page);
  return applyReleases(tx, locked.id, page, current.releaseIds);
}
