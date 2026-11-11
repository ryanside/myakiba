import type { ItemUpload } from "@myakiba/contracts/mfc-items/schema";
import type { MfcItemId } from "@myakiba/mfc/page";
import { Result } from "better-result";
import { command } from "@/domain/kernel";
import { MfcItemNotPersisted } from "@/lib/errors/mfc-item-not-persisted";
import { MfcPageRejected } from "@/lib/errors/mfc-page-rejected";
import { StoreItemPictureFailed } from "@/lib/errors/store-item-picture-failed";
import { addMfcItemIfMissing } from "@/lib/item-database";
import type { PictureOutcome } from "@/lib/item-images";
import { pictureLog, prepareMfcItem, refusedPageLog } from "@/lib/mfc-item-ingest";

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
        const prepared = await prepareMfcItem(scope.tx, scope.viewer, input);
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
    async (scope, { page, picture }) => {
      const id = page.mfcItemId;
      const ensured = await addMfcItemIfMissing(scope.tx, scope.viewer, page, picture);
      if (ensured.isErr()) return ensured;
      const added = ensured.value;
      scope.log.set({
        mfc: {
          itemId: id,
          contentLabel: page.contentLabel,
          outcome: added.created ? "created" : "existing",
          ...(added.created && { picture: pictureLog(picture, added.picture) }),
          warnings: page.warnings,
        },
      });
      return Result.ok<IngestResult>(
        added.created
          ? { saved: "created", itemId: added.itemId, mfcItemId: id, picture: added.picture }
          : { saved: "existing", itemId: added.itemId, mfcItemId: id },
      );
    },
  ),
};
