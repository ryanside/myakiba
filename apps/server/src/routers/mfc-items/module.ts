import { and, eq, inArray, sql } from "drizzle-orm";
import type { ItemUpload, MissingItemsInput } from "@myakiba/contracts/mfc-items/schema";
import { MFC_ITEM_METADATA_VERSION } from "@myakiba/contracts/shared/constants";
import { entry, entry_to_item, item, item_release } from "@myakiba/db/schema/figure";
import type { Tx } from "@myakiba/db/tx";
import { mfcItemId } from "@myakiba/mfc/page";
import type { MfcItemId } from "@myakiba/mfc/page";
import { mfcReleaseId, parseMfcItemPage } from "@myakiba/mfc/parse";
import type { MfcItemPage, MfcPageProblem } from "@myakiba/mfc/parse";
import { command, fail, ok, query } from "@/domain/kernel";
import { itemImages } from "@/lib/item-images";
import type { ItemImages, StoredPicture } from "@/lib/item-images";

const PROBLEM_MESSAGE = {
  challenge: "MyFigureCollection showed a security check instead of the item",
  not_found: "MyFigureCollection did not show this item",
  not_an_item_page: "The page is not a MyFigureCollection item page",
  wrong_item: "The page is for a different item",
  missing_title: "The item page has no title",
  missing_category: "The item page has no category",
  unsupported_category: "This item category is not supported",
} as const satisfies Record<MfcPageProblem["kind"], string>;

type PictureOutcome = "stored" | "absent" | "rejected";

type IngestResult =
  | { readonly saved: "existing"; readonly itemId: string; readonly mfcItemId: MfcItemId }
  | {
      readonly saved: "created";
      readonly itemId: string;
      readonly mfcItemId: MfcItemId;
      readonly picture: PictureOutcome;
    };

async function findMfcItem(tx: Tx, id: MfcItemId): Promise<string | undefined> {
  const [found] = await tx
    .select({ id: item.id })
    .from(item)
    .where(and(eq(item.source, "mfc"), eq(item.externalId, id)));
  return found?.id;
}

/** Writes the item and, only when this call created it, its entries, links and releases. */
async function insertMfcItem(
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

  // Ingests of items that share entries lock entry rows in one order, so they cannot deadlock.
  const links = page.entries.toSorted((a, b) => a.externalId - b.externalId);
  if (links.length > 0) {
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

const pictureOutcome = (stored: StoredPicture | null): PictureOutcome =>
  stored === null ? "absent" : stored.kind;

export function makeMfcItems(images: ItemImages) {
  return {
    missing: query(
      { action: "mfc_items.missing", failure: "Failed to check which items are missing" },
      async (scope, input: MissingItemsInput) => {
        const found = await scope.tx
          .select({ externalId: item.externalId })
          .from(item)
          .where(and(eq(item.source, "mfc"), inArray(item.externalId, input.mfcItemIds)));
        const existing = new Set(found.map((row) => row.externalId));
        return ok({ missing: input.mfcItemIds.filter((id) => !existing.has(id)) });
      },
    ),

    /** Saves an MFC item page as a new Item. An item that already exists is left as it is. */
    ingest: command(
      { action: "mfc_items.ingest", failure: "Failed to import item" },
      async (scope, input: ItemUpload) => {
        const id = mfcItemId(input.mfcItemId);
        if (id === null) return fail("bad_request", "The MFC item id is not valid");

        const existingId = await findMfcItem(scope.tx, id);
        if (existingId) {
          scope.log.set({ mfc: { itemId: id, outcome: "existing" } });
          return ok<IngestResult>({ saved: "existing", itemId: existingId, mfcItemId: id });
        }

        const html = input.page instanceof File ? await input.page.text() : input.page;
        const parsed = parseMfcItemPage(html, id);
        if (!parsed.ok) {
          scope.log.set({ mfc: { itemId: id, outcome: parsed.problem.kind } });
          return fail("bad_request", PROBLEM_MESSAGE[parsed.problem.kind]);
        }
        const { page } = parsed;

        const stored = page.picture && input.picture ? await images.store(id, input.picture) : null;
        const picture = pictureOutcome(stored);
        const createdId = await insertMfcItem(
          scope.tx,
          page,
          stored?.kind === "stored" ? stored.url : null,
        );
        const itemId = createdId ?? (await findMfcItem(scope.tx, id));
        if (!itemId) throw new Error(`MFC item ${id} was neither created nor found`);

        scope.log.set({
          mfc: {
            itemId: id,
            contentLabel: page.contentLabel,
            outcome: createdId ? "created" : "existing",
            picture: stored?.kind === "rejected" ? `rejected: ${stored.reason}` : picture,
            warnings: page.warnings,
          },
        });
        return ok<IngestResult>(
          createdId
            ? { saved: "created", itemId, mfcItemId: id, picture }
            : { saved: "existing", itemId, mfcItemId: id },
        );
      },
    ),
  };
}

export const MfcItems = makeMfcItems(itemImages);
