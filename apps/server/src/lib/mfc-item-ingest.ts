import { Result } from "better-result";
import { and, eq, sql } from "drizzle-orm";
import type { ItemRefresh, ItemUpload } from "@myakiba/contracts/mfc-items/schema";
import { MFC_ITEM_METADATA_VERSION } from "@myakiba/contracts/shared/constants";
import { entry, entry_to_item, item, item_release } from "@myakiba/db/schema/figure";
import type { ReadTx, Tx } from "@myakiba/db/tx";
import type { MfcItemId } from "@myakiba/mfc/page";
import { mfcReleaseId, parseMfcItemPage } from "@myakiba/mfc/parse";
import type { MfcItemPage, MfcPageUnreadable } from "@myakiba/mfc/parse";
import { itemImages } from "@/lib/item-images";
import type { StoredPicture } from "@/lib/item-images";
import { StoreItemPictureFailed } from "@/lib/errors/store-item-picture-failed";

export type PictureOutcome = "stored" | "absent" | "rejected";

type ParsedMfcItem = {
  readonly kind: "parsed";
  readonly page: MfcItemPage;
  readonly stored: StoredPicture | null;
};

type PreparedMfcItem =
  | { readonly kind: "existing"; readonly mfcItemId: MfcItemId; readonly itemId: string }
  | ParsedMfcItem;

export async function findMfcItem(tx: ReadTx, id: MfcItemId): Promise<string | undefined> {
  const [found] = await tx
    .select({ id: item.id })
    .from(item)
    .where(and(eq(item.source, "mfc"), eq(item.externalId, id)));
  return found?.id;
}

/** Parses the page and stores its picture. Run it before any transaction opens: a stored picture is never rolled back. */
export async function readMfcItemPage(
  id: MfcItemId,
  upload: ItemRefresh,
): Promise<Result<ParsedMfcItem, MfcPageUnreadable | StoreItemPictureFailed>> {
  const html = upload.page instanceof File ? await upload.page.text() : upload.page;
  const parsed = parseMfcItemPage(html, id);
  if (parsed.isErr()) return Result.err(parsed.error);
  const page = parsed.value;
  const { picture } = upload;
  if (!page.picture || !picture) return Result.ok({ kind: "parsed", page, stored: null });
  const stored = await Result.tryPromise({
    try: () => itemImages.store(id, picture),
    catch: (cause) => new StoreItemPictureFailed({ mfcItemId: id, cause }),
  });
  return stored.map((saved) => ({ kind: "parsed", page, stored: saved }));
}

/** The slow half of an ingest: an Item already in the pool answers at once, otherwise the page is read. */
export async function prepareMfcItem(
  pool: ReadTx,
  upload: ItemUpload,
): Promise<Result<PreparedMfcItem, MfcPageUnreadable | StoreItemPictureFailed>> {
  const id = upload.mfcItemId as MfcItemId;
  const existingId = await findMfcItem(pool, id);
  if (existingId) return Result.ok({ kind: "existing", mfcItemId: id, itemId: existingId });
  return readMfcItemPage(id, upload);
}

export const pictureOutcome = (stored: StoredPicture | null): PictureOutcome =>
  stored?.kind ?? "absent";

export const pictureLog = (stored: StoredPicture | null) =>
  stored?.kind === "rejected" ? `rejected: ${stored.reason}` : pictureOutcome(stored);

export function itemFields(page: MfcItemPage) {
  return {
    title: page.title,
    mfcTitle: page.mfcTitle,
    numbering: page.numbering,
    category: page.category,
    version: [...page.version],
    scale: page.scale,
    height: page.height,
    width: page.width,
    depth: page.depth,
    mfcMetadataVersion: MFC_ITEM_METADATA_VERSION,
    contentLabel: page.contentLabel,
    mfcRatingId: page.mfcRatingId,
  };
}

export function linksInLockOrder(page: MfcItemPage) {
  return page.entries.toSorted((a, b) => a.externalId - b.externalId);
}

export async function linkEntries(tx: Tx, itemId: string, page: MfcItemPage): Promise<void> {
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
      if (!entryId) throw new Error(`Entry ${link.externalId} was not saved`);
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

export function releaseRows(itemId: string, page: MfcItemPage) {
  return page.releases.map((release) => ({
    id: mfcReleaseId(page.mfcItemId, release),
    itemId,
    ...release,
  }));
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
    await tx
      .insert(item_release)
      .values(releaseRows(created.id, page))
      .onConflictDoNothing({ target: [item_release.id] });
  }
  return created.id;
}

/** Inserts the Item unless another upload already did. Only the insert's winner writes its details. */
export async function ensureMfcItem(
  tx: Tx,
  page: MfcItemPage,
  stored: StoredPicture | null,
): Promise<{ readonly itemId: string; readonly created: boolean }> {
  const createdId = await createMfcItemIfAbsent(
    tx,
    page,
    stored?.kind === "stored" ? stored.url : null,
  );
  if (createdId) return { itemId: createdId, created: true };
  const existingId = await findMfcItem(tx, page.mfcItemId);
  if (!existingId) throw new Error(`MFC item ${page.mfcItemId} was neither created nor found`);
  return { itemId: existingId, created: false };
}
