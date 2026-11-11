import { Result, panic } from "better-result";
import { and, asc, count, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { advanceOrderReleaseDatesForCollectionItems } from "@myakiba/db/order-release-date";
import { collection, entry, entry_to_item, item, item_release } from "@myakiba/db/schema/figure";
import type { ReadTx, Tx } from "@myakiba/db/tx";
import type { MfcItemId } from "@myakiba/mfc/page";
import type { MfcEntryLink, MfcItemPage } from "@myakiba/mfc/parse";
import type { Viewer } from "@/domain/viewer";
import { ItemDatabaseFull } from "@/lib/errors/item-database-full";
import { ItemNotFound } from "@/lib/errors/item-not-found";
import { MfcItemNotPersisted } from "@/lib/errors/mfc-item-not-persisted";
import { itemFields, linksInLockOrder, releaseKey, storedPercentage } from "@/lib/item-details";
import type { PictureOutcome, StoredPicture } from "@/lib/item-images";
import { buildReleasePlan } from "@/lib/release-plan";
import type { ReleasePlan } from "@/lib/release-plan";

/** How many bytes of pictures stored by content one account's Items may show. */
const PICTURE_QUOTA_BYTES = 2 * 1024 ** 3;

/** How many Items one account's Item Database may hold. */
const MAX_ITEMS_PER_ACCOUNT = 20_000;

export async function findMfcItem(
  tx: ReadTx,
  viewer: Viewer,
  id: MfcItemId,
): Promise<string | undefined> {
  const [found] = await tx
    .select({ id: item.id })
    .from(item)
    .where(and(eq(item.ownerId, viewer.userId), eq(item.source, "mfc"), eq(item.externalId, id)));
  return found?.id;
}

/**
 * Whether the owner's pictures stay within the quota with `image` too. Only pictures stored by
 * content count, each distinct one once, so one the owner already shows adds nothing. `replacing`
 * leaves out the Item whose picture an Item Refresh replaces.
 */
export async function pictureFits(
  tx: ReadTx,
  viewer: Viewer,
  { image, bytes, replacing }: { image: string; bytes: number; replacing?: string },
): Promise<boolean> {
  const pictures = tx
    .selectDistinct({ image: item.image, bytes: item.imageBytes })
    .from(item)
    .where(
      and(
        eq(item.ownerId, viewer.userId),
        isNotNull(item.imageBytes),
        replacing === undefined ? undefined : ne(item.id, replacing),
      ),
    )
    .as("pictures");
  const [usage] = await tx
    .select({
      used: sql<number>`coalesce(sum(${pictures.bytes}), 0)`.mapWith(Number),
      shown: sql<boolean>`coalesce(bool_or(${pictures.image} = ${image}), false)`,
    })
    .from(pictures);
  if (!usage) panic(`An aggregate over ${viewer.userId}'s pictures returned no row`);
  return usage.shown || usage.used + bytes <= PICTURE_QUOTA_BYTES;
}

/**
 * Serializes one owner's Item writes, so the Item cap and the picture quota see every write
 * before it. Taken before any Item row lock.
 */
function lockItemDatabase(tx: Tx, viewer: Viewer) {
  return tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`items:${viewer.userId}`}, 0))`,
  );
}

type ShownPicture = { readonly image: string; readonly imageBytes: number } | null;

/** The picture a write shows, after the quota check that counts: the one under the lock. */
async function pictureToShow(
  tx: Tx,
  viewer: Viewer,
  picture: StoredPicture | null,
  replacing?: string,
): Promise<{ readonly shown: ShownPicture; readonly outcome: PictureOutcome }> {
  if (picture === null) return { shown: null, outcome: "absent" };
  if (picture.kind === "rejected") {
    return { shown: null, outcome: picture.reason === "over_quota" ? "over_quota" : "rejected" };
  }
  const { url: image, bytes } = picture;
  if (!(await pictureFits(tx, viewer, { image, bytes, replacing }))) {
    return { shown: null, outcome: "over_quota" };
  }
  return { shown: { image, imageBytes: bytes }, outcome: "stored" };
}

function releaseRows(itemId: string, page: MfcItemPage) {
  const unique = new Map(page.releases.map((release) => [releaseKey(release), release]));
  return [...unique.values()].map((release) => ({ id: crypto.randomUUID(), itemId, ...release }));
}

async function linkEntries(
  tx: Tx,
  ownerId: string,
  itemId: string,
  page: MfcItemPage,
): Promise<void> {
  const links = linksInLockOrder(page);
  if (links.length === 0) return;
  const entries = await tx
    .insert(entry)
    .values(
      links.map((link) => ({
        ownerId,
        externalId: link.externalId,
        source: "mfc" as const,
        category: link.category,
        name: link.name,
      })),
    )
    .onConflictDoUpdate({
      target: [entry.ownerId, entry.source, entry.externalId],
      set: { name: sql`excluded.name`, category: sql`excluded.category`, updatedAt: new Date() },
    })
    .returning({ id: entry.id, externalId: entry.externalId });
  const entryIds = new Map(entries.map((row) => [row.externalId, row.id]));
  await tx.insert(entry_to_item).values(
    links.map((link) => {
      const entryId = entryIds.get(link.externalId);
      if (!entryId) {
        panic(
          `Entry ${link.externalId} was not returned by its upsert while linking item ${itemId}`,
        );
      }
      return {
        ownerId,
        entryId,
        itemId,
        role: link.roles[0] ?? "",
        roles: [...link.roles],
        sourceLabel: link.sourceLabel,
        materialPercentage: link.materialPercentage,
      };
    }),
  );
}

async function createMfcItemIfAbsent(
  tx: Tx,
  ownerId: string,
  page: MfcItemPage,
  shown: ShownPicture,
): Promise<string | undefined> {
  const [created] = await tx
    .insert(item)
    .values({
      ownerId,
      externalId: page.mfcItemId,
      source: "mfc",
      ...itemFields(page),
      image: shown?.image ?? null,
      imageBytes: shown?.imageBytes ?? null,
    })
    .onConflictDoNothing({ target: [item.ownerId, item.source, item.externalId] })
    .returning({ id: item.id });
  if (!created) return undefined;

  await linkEntries(tx, ownerId, created.id, page);
  if (page.releases.length > 0) {
    await tx.insert(item_release).values(releaseRows(created.id, page));
  }
  return created.id;
}

type Added =
  | { readonly created: false; readonly itemId: string }
  | { readonly created: true; readonly itemId: string; readonly picture: PictureOutcome };

/**
 * Adds the page's Item to the viewer's Item Database, or answers the one they already have for
 * that MFC id. A full Item Database adds nothing, and a picture over the quota is left out.
 */
export async function addMfcItemIfMissing(
  tx: Tx,
  viewer: Viewer,
  page: MfcItemPage,
  picture: StoredPicture | null,
): Promise<Result<Added, MfcItemNotPersisted | ItemDatabaseFull>> {
  await lockItemDatabase(tx, viewer);
  const existingId = await findMfcItem(tx, viewer, page.mfcItemId);
  if (existingId) return Result.ok({ itemId: existingId, created: false });
  const [held] = await tx
    .select({ items: count() })
    .from(item)
    .where(eq(item.ownerId, viewer.userId));
  if ((held?.items ?? 0) >= MAX_ITEMS_PER_ACCOUNT) return Result.err(new ItemDatabaseFull());
  const { shown, outcome } = await pictureToShow(tx, viewer, picture);
  const createdId = await createMfcItemIfAbsent(tx, viewer.userId, page, shown);
  if (!createdId) return Result.err(new MfcItemNotPersisted({ mfcItemId: page.mfcItemId }));
  return Result.ok({ itemId: createdId, created: true, picture: outcome });
}

async function lockItem(tx: Tx, ownerId: string, itemId: string) {
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
      imageBytes: item.imageBytes,
    })
    .from(item)
    .where(and(eq(item.ownerId, ownerId), eq(item.id, itemId)))
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
    materialPercentage: storedPercentage(link.materialPercentage),
  };
}

type Snapshot = {
  readonly fields: Omit<LockedItem, "id">;
  readonly links: readonly Link[];
  readonly releaseKeys: readonly string[];
};

type ReleaseRow = ReturnType<typeof releaseRows>[number];

async function storedReleases(tx: Tx, itemId: string) {
  const rows = await tx
    .select({
      id: item_release.id,
      date: item_release.date,
      type: item_release.type,
      price: item_release.price,
      priceCurrency: item_release.priceCurrency,
      barcode: item_release.barcode,
    })
    .from(item_release)
    .where(eq(item_release.itemId, itemId));
  return rows.map((row) => ({ id: row.id, key: releaseKey(row) }));
}

const sortedKeys = (releases: readonly { readonly key: string }[]) =>
  releases.map((release) => release.key).toSorted();

async function applyReleases(
  tx: Tx,
  itemId: string,
  plan: ReleasePlan,
  rows: readonly ReleaseRow[],
): Promise<ReleasePlan["kind"]> {
  const added = new Set(plan.addedReleaseIds);
  const inserts = rows.filter((row) => added.has(row.id));
  if (inserts.length > 0) await tx.insert(item_release).values(inserts);

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

type Refreshed = {
  readonly saved: ReleasePlan["kind"] | "unchanged";
  readonly picture: PictureOutcome;
};

/** Replaces one of the viewer's Items' details. A picture over the quota keeps the current one. */
export async function refreshItem(
  tx: Tx,
  viewer: Viewer,
  itemId: string,
  page: MfcItemPage,
  picture: StoredPicture | null,
): Promise<Result<Refreshed, ItemNotFound>> {
  await lockItemDatabase(tx, viewer);
  const locked = await lockItem(tx, viewer.userId, itemId);
  if (!locked) return Result.err(new ItemNotFound());
  const { id, ...fields } = locked;
  const { shown, outcome } = await pictureToShow(tx, viewer, picture, id);
  const { image, imageBytes } = shown ?? fields;
  const existing = await storedReleases(tx, id);
  const rows = releaseRows(id, page);
  const keyed = rows.map((row) => ({ id: row.id, key: releaseKey(row) }));
  const current: Snapshot = {
    fields,
    links: await storedLinks(tx, id),
    releaseKeys: sortedKeys(existing),
  };
  const next: Snapshot = {
    fields: { ...itemFields(page), image, imageBytes },
    links: linksInLockOrder(page).map(pageLink),
    releaseKeys: sortedKeys(keyed),
  };
  if (Bun.deepEquals(current, next)) return Result.ok({ saved: "unchanged", picture: outcome });

  await tx
    .update(item)
    .set({ ...itemFields(page), image, imageBytes, updatedAt: new Date() })
    .where(eq(item.id, id));
  await tx.delete(entry_to_item).where(eq(entry_to_item.itemId, id));
  await linkEntries(tx, viewer.userId, id, page);
  const plan = buildReleasePlan({ existing, page: keyed });
  return Result.ok({ saved: await applyReleases(tx, id, plan, rows), picture: outcome });
}
