import { and, eq, sql } from "drizzle-orm";
import type { RequestLogger } from "evlog";
import type { ItemRefresh } from "@myakiba/contracts/mfc-items/schema";
import { MFC_ITEM_METADATA_VERSION } from "@myakiba/contracts/shared/constants";
import { entry, entry_to_item, item } from "@myakiba/db/schema/figure";
import type { ReadTx, Tx } from "@myakiba/db/tx";
import type { MfcItemId } from "@myakiba/mfc/page";
import { mfcReleaseId, parseMfcItemPage } from "@myakiba/mfc/parse";
import type { MfcItemPage, MfcPageProblem } from "@myakiba/mfc/parse";
import { fail, proceed } from "@/domain/kernel";
import { itemImages } from "@/lib/item-images";

const PROBLEM_MESSAGE = {
  challenge: "MyFigureCollection showed a security check instead of the item",
  not_found: "MyFigureCollection did not show this item",
  not_an_item_page: "The page is not a MyFigureCollection item page",
  wrong_item: "The page is for a different item",
  missing_title: "The item page has no title",
  missing_category: "The item page has no category",
  unsupported_category: "This item category is not supported",
} as const satisfies Record<MfcPageProblem["kind"], string>;

export type PictureOutcome = "stored" | "absent" | "rejected";

export type StoredPicture = Awaited<ReturnType<typeof itemImages.store>>;

export async function findMfcItem(tx: ReadTx, id: MfcItemId): Promise<string | undefined> {
  const [found] = await tx
    .select({ id: item.id })
    .from(item)
    .where(and(eq(item.source, "mfc"), eq(item.externalId, id)));
  return found?.id;
}

export async function readPage(log: RequestLogger, id: MfcItemId, input: ItemRefresh) {
  const html = input.page instanceof File ? await input.page.text() : input.page;
  const parsed = parseMfcItemPage(html, id);
  if (!parsed.ok) {
    log.set({ mfc: { itemId: id, outcome: parsed.problem.kind } });
    return fail("bad_request", PROBLEM_MESSAGE[parsed.problem.kind]);
  }
  const { page } = parsed;
  const stored = page.picture && input.picture ? await itemImages.store(id, input.picture) : null;
  return proceed({ page, stored });
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
