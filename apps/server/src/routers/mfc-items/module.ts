import { and, eq, inArray } from "drizzle-orm";
import type { ItemUpload, MissingItemsInput } from "@myakiba/contracts/mfc-items/schema";
import { item } from "@myakiba/db/schema/figure";
import type { MfcItemId } from "@myakiba/mfc/page";
import { Result } from "better-result";
import { command, query } from "@/domain/kernel";
import { MfcPageRejected } from "@/lib/errors/mfc-page-rejected";
import { ensureMfcItem, pictureLog, pictureOutcome, prepareMfcItem } from "@/lib/mfc-item-ingest";
import type { PictureOutcome } from "@/lib/mfc-item-ingest";

type IngestResult =
  | { readonly saved: "existing"; readonly itemId: string; readonly mfcItemId: MfcItemId }
  | {
      readonly saved: "created";
      readonly itemId: string;
      readonly mfcItemId: MfcItemId;
      readonly picture: PictureOutcome;
    };

export const MfcItems = {
  missing: query(
    { action: "mfc_items.missing", failure: "Failed to check which items are missing" },
    async (scope, input: MissingItemsInput) => {
      const found = await scope.tx
        .select({ externalId: item.externalId })
        .from(item)
        .where(and(eq(item.source, "mfc"), inArray(item.externalId, input.mfcItemIds)));
      const existing = new Set(found.map((row) => row.externalId));
      return Result.ok({ missing: input.mfcItemIds.filter((id) => !existing.has(id)) });
    },
  ),

  ingest: command(
    {
      action: "mfc_items.ingest",
      failure: "Failed to import item",
      before: async (scope, input: ItemUpload) => {
        const prepared = await prepareMfcItem(scope.tx, input);
        if (prepared.kind === "parsed") return scope.proceed(prepared);
        scope.log.set({
          mfc: {
            itemId: prepared.mfcItemId,
            outcome: prepared.kind === "existing" ? "existing" : prepared.problem,
          },
        });
        if (prepared.kind === "unreadable")
          return Result.err(new MfcPageRejected({ problem: prepared.problem }));
        return Result.ok<IngestResult>({
          saved: "existing",
          itemId: prepared.itemId,
          mfcItemId: prepared.mfcItemId,
        });
      },
    },
    async (scope, { page, stored }) => {
      const id = page.mfcItemId;
      const picture = pictureOutcome(stored);
      const { itemId, created } = await ensureMfcItem(scope.tx, page, stored);

      scope.log.set({
        mfc: {
          itemId: id,
          contentLabel: page.contentLabel,
          outcome: created ? "created" : "existing",
          picture: pictureLog(stored),
          warnings: page.warnings,
        },
      });
      return Result.ok<IngestResult>(
        created
          ? { saved: "created", itemId, mfcItemId: id, picture }
          : { saved: "existing", itemId, mfcItemId: id },
      );
    },
  ),
};
