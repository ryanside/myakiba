import { Result, panic } from "better-result";
import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { advanceOrderReleaseDatesForCollectionItems } from "@myakiba/db/order-release-date";
import { collection, entry, entry_to_item, item, item_release } from "@myakiba/db/schema/figure";
import type { ReadTx, Tx } from "@myakiba/db/tx";
import type { MfcItemId } from "@myakiba/mfc/page";
import type { MfcEntryLink, MfcItemPage } from "@myakiba/mfc/parse";
import { ItemNotFound } from "@/lib/errors/item-not-found";
import { MfcItemNotPersisted } from "@/lib/errors/mfc-item-not-persisted";
import { itemFields, linksInLockOrder, releaseKey, storedPercentage } from "@/lib/item-details";
import type { StoredPicture } from "@/lib/item-images";
import { buildReleasePlan } from "@/lib/release-plan";
import type { ReleasePlan } from "@/lib/release-plan";

export async function findMfcItem(tx: ReadTx, id: MfcItemId): Promise<string | undefined> {
  const [found] = await tx
    .select({ id: item.id })
    .from(item)
    .where(and(eq(item.source, "mfc"), eq(item.externalId, id)));
  return found?.id;
}

function releaseRows(itemId: string, page: MfcItemPage) {
  const unique = new Map(page.releases.map((release) => [releaseKey(release), release]));
  return [...unique.values()].map((release) => ({ id: crypto.randomUUID(), itemId, ...release }));
}

async function linkEntries(tx: Tx, itemId: string, page: MfcItemPage): Promise<void> {
  const links = linksInLockOrder(page);
  if (links.length === 0) return;
  const entries = await tx
    .insert(entry)
    .values(
      links.map((link) => ({
        externalId: link.externalId,
        source: "mfc" as const,
        category: link.category,
        name: link.name,
      })),
    )
    .onConflictDoUpdate({
      target: [entry.source, entry.externalId],
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
  page: MfcItemPage,
  image: string | null,
): Promise<string | undefined> {
  const [created] = await tx
    .insert(item)
    .values({ externalId: page.mfcItemId, source: "mfc", ...itemFields(page), image })
    .onConflictDoNothing({ target: [item.source, item.externalId] })
    .returning({ id: item.id });
  if (!created) return undefined;

  await linkEntries(tx, created.id, page);
  if (page.releases.length > 0) {
    await tx.insert(item_release).values(releaseRows(created.id, page));
  }
  return created.id;
}

export async function ensureMfcItem(
  tx: Tx,
  page: MfcItemPage,
  stored: StoredPicture | null,
): Promise<Result<{ readonly itemId: string; readonly created: boolean }, MfcItemNotPersisted>> {
  const createdId = await createMfcItemIfAbsent(
    tx,
    page,
    stored?.kind === "stored" ? stored.url : null,
  );
  if (createdId) return Result.ok({ itemId: createdId, created: true });
  const existingId = await findMfcItem(tx, page.mfcItemId);
  if (!existingId) return Result.err(new MfcItemNotPersisted({ mfcItemId: page.mfcItemId }));
  return Result.ok({ itemId: existingId, created: false });
}

async function lockItem(tx: Tx, itemId: string) {
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

export async function refreshItem(
  tx: Tx,
  itemId: string,
  page: MfcItemPage,
  stored: StoredPicture | null,
): Promise<Result<ReleasePlan["kind"] | "unchanged", ItemNotFound>> {
  const locked = await lockItem(tx, itemId);
  if (!locked) return Result.err(new ItemNotFound());
  const { id, ...fields } = locked;
  const image = stored?.kind === "stored" ? stored.url : fields.image;
  const existing = await storedReleases(tx, id);
  const rows = releaseRows(id, page);
  const keyed = rows.map((row) => ({ id: row.id, key: releaseKey(row) }));
  const current: Snapshot = {
    fields,
    links: await storedLinks(tx, id),
    releaseKeys: sortedKeys(existing),
  };
  const next: Snapshot = {
    fields: { ...itemFields(page), image },
    links: linksInLockOrder(page).map(pageLink),
    releaseKeys: sortedKeys(keyed),
  };
  if (Bun.deepEquals(current, next)) return Result.ok("unchanged");

  await tx
    .update(item)
    .set({ ...itemFields(page), image, updatedAt: new Date() })
    .where(eq(item.id, id));
  await tx.delete(entry_to_item).where(eq(entry_to_item.itemId, id));
  await linkEntries(tx, id, page);
  return Result.ok(await applyReleases(tx, id, buildReleasePlan({ existing, page: keyed }), rows));
}
