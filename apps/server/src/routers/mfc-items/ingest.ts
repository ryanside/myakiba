import { and, eq, sql } from "drizzle-orm";
import type { ItemUpload } from "@myakiba/contracts/mfc-items/schema";
import { MFC_ITEM_METADATA_VERSION } from "@myakiba/contracts/shared/constants";
import { entry, entry_to_item, item, item_release } from "@myakiba/db/schema/figure";
import type { ReadTx, Tx } from "@myakiba/db/tx";
import type { MfcItemId } from "@myakiba/mfc/page";
import { mfcReleaseId, parseMfcItemPage } from "@myakiba/mfc/parse";
import type { MfcItemPage, MfcPageProblem } from "@myakiba/mfc/parse";
import { itemImages } from "@/lib/item-images";
import type { StoredPicture } from "@/lib/item-images";

const PROBLEM_MESSAGE = {
  challenge: "MyFigureCollection showed a security check instead of the item",
  not_found: "MyFigureCollection did not show this item",
  not_an_item_page: "The page is not a MyFigureCollection item page",
  wrong_item: "The page is for a different item",
  missing_title: "The item page has no title",
  missing_category: "The item page has no category",
  unsupported_category: "This item category is not supported",
} as const satisfies Record<MfcPageProblem["kind"], string>;

export type PreparedMfcItem =
  | { readonly kind: "existing"; readonly mfcItemId: MfcItemId; readonly itemId: string }
  | {
      readonly kind: "unreadable";
      readonly mfcItemId: MfcItemId;
      readonly problem: MfcPageProblem["kind"];
      readonly message: (typeof PROBLEM_MESSAGE)[MfcPageProblem["kind"]];
    }
  | { readonly kind: "parsed"; readonly page: MfcItemPage; readonly stored: StoredPicture | null };

async function findMfcItem(tx: ReadTx, id: MfcItemId): Promise<string | undefined> {
  const [found] = await tx
    .select({ id: item.id })
    .from(item)
    .where(and(eq(item.source, "mfc"), eq(item.externalId, id)));
  return found?.id;
}

/**
 * The slow half of an ingest, run before any transaction opens: it reads the pool,
 * parses the page and stores the picture. A stored picture is never rolled back.
 */
export async function prepareMfcItem(pool: ReadTx, upload: ItemUpload): Promise<PreparedMfcItem> {
  const id = upload.mfcItemId as MfcItemId;
  const existingId = await findMfcItem(pool, id);
  if (existingId) return { kind: "existing", mfcItemId: id, itemId: existingId };

  const html = upload.page instanceof File ? await upload.page.text() : upload.page;
  const parsed = parseMfcItemPage(html, id);
  if (!parsed.ok) {
    const problem = parsed.problem.kind;
    return { kind: "unreadable", mfcItemId: id, problem, message: PROBLEM_MESSAGE[problem] };
  }
  const { page } = parsed;
  const stored = page.picture && upload.picture ? await itemImages.store(id, upload.picture) : null;
  return { kind: "parsed", page, stored };
}

async function createMfcItemIfAbsent(
  tx: Tx,
  page: MfcItemPage,
  image: string | null,
): Promise<string | undefined> {
  const [created] = await tx
    .insert(item)
    .values({
      externalId: page.mfcItemId,
      source: "mfc",
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
      image,
    })
    .onConflictDoNothing({ target: [item.source, item.externalId] })
    .returning({ id: item.id });
  if (!created) return undefined;

  const linksInLockOrder = page.entries.toSorted((a, b) => a.externalId - b.externalId);
  if (linksInLockOrder.length > 0) {
    const entries = await tx
      .insert(entry)
      .values(
        linksInLockOrder.map((link) => ({
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
      linksInLockOrder.map((link) => {
        const entryId = entryIds.get(link.externalId);
        if (!entryId) throw new Error(`Entry ${link.externalId} was not saved`);
        return {
          entryId,
          itemId: created.id,
          role: link.roles[0] ?? "",
          roles: [...link.roles],
          sourceLabel: link.sourceLabel,
          materialPercentage: link.materialPercentage,
        };
      }),
    );
  }

  if (page.releases.length > 0) {
    await tx
      .insert(item_release)
      .values(
        page.releases.map((release) => ({
          id: mfcReleaseId(page.mfcItemId, release),
          itemId: created.id,
          ...release,
        })),
      )
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
