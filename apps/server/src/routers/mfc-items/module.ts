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
        if (prepared.isErr()) {
          return prepared.error.match({
            MfcPageUnreadable: ({ mfcItemId, problem }) => {
              scope.log.set({ mfc: { itemId: mfcItemId, outcome: problem.kind } });
              return Result.err(new MfcPageRejected({ problem: problem.kind }));
            },
            StoreItemPictureFailed: (failed) => Result.err(failed),
          });
        }
        const ready = prepared.value;
        if (ready.kind === "parsed") return scope.proceed(ready);
        scope.log.set({ mfc: { itemId: ready.mfcItemId, outcome: "existing" } });
        return Result.ok<IngestResult>({
          saved: "existing",
          itemId: ready.itemId,
          mfcItemId: ready.mfcItemId,
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
    {
      // S3 has no fallback, so a picture it did not take answers the logged 500 with its error.
      recover: async (_scope, _input, error) => {
        throw error.match({
          StoreItemPictureFailed: (failed) => failed.cause,
          UnhandledException: (thrown) => thrown,
        });
      },
    },
  ),
};
