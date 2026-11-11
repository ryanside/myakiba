import type { ItemUpload } from "@myakiba/contracts/mfc-items/schema";
import type { MfcItemId } from "@myakiba/mfc/page";
import { Result } from "better-result";
import { command } from "@/domain/kernel";
import { MfcItemNotPersisted } from "@/lib/errors/mfc-item-not-persisted";
import { MfcPageRejected } from "@/lib/errors/mfc-page-rejected";
import { StoreItemPictureFailed } from "@/lib/errors/store-item-picture-failed";
import { ensureMfcItem } from "@/lib/item-database";
import { pictureLog, pictureOutcome, prepareMfcItem, refusedPageLog } from "@/lib/mfc-item-ingest";
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
  ingest: command(
    {
      action: "mfc_items.ingest",
      failure: "Failed to save item",
      // Neither failure has a fallback, so each answers the logged 500.
      operational: [StoreItemPictureFailed, MfcItemNotPersisted],
      before: async (scope, input: ItemUpload) => {
        const prepared = await prepareMfcItem(scope.tx, input);
        if (prepared.isErr()) {
          const failure = prepared.error;
          if (failure._tag === "StoreItemPictureFailed") return Result.err(failure);
          scope.log.set({ mfc: refusedPageLog(failure) });
          return Result.err(new MfcPageRejected({ problem: failure.problem.kind }));
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
      const ensured = await ensureMfcItem(scope.tx, page, stored);
      if (ensured.isErr()) return ensured;
      const { itemId, created } = ensured.value;

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
