import type { ItemUpload } from "@myakiba/contracts/mfc-items/schema";
import type { MfcItemId } from "@myakiba/mfc/page";
import { Result } from "better-result";
import { command } from "@/domain/kernel";
import { MfcItemNotPersisted } from "@/lib/errors/mfc-item-not-persisted";
import { MfcPageRejected } from "@/lib/errors/mfc-page-rejected";
import { StoreItemPictureFailed } from "@/lib/errors/store-item-picture-failed";
import { ItemDatabaseFull } from "@/lib/errors/item-database-full";
import { addMfcItemIfMissing, findMfcItem, itemDatabaseIsFull } from "@/lib/item-database";
import type { PictureOutcome } from "@/lib/item-images";
import {
  pictureLog,
  readMfcItemPage,
  readPagePicture,
  refusedPageLog,
  reservePagePicture,
  storePagePicture,
} from "@/lib/mfc-item-ingest";

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
        const id = input.mfcItemId as MfcItemId;
        const existingId = await findMfcItem(scope.tx, scope.viewer, id);
        if (existingId) {
          scope.log.set({ mfc: { itemId: id, outcome: "existing" } });
          return Result.ok<IngestResult>({ saved: "existing", itemId: existingId, mfcItemId: id });
        }
        if (await itemDatabaseIsFull(scope.tx, scope.viewer)) {
          scope.log.set({ mfc: { itemId: id, outcome: "database_full" } });
          return Result.err(new ItemDatabaseFull());
        }
        const read = await readMfcItemPage(id, input);
        if (read.isErr()) {
          scope.log.set({ mfc: refusedPageLog(read.error) });
          return Result.err(new MfcPageRejected({ problem: read.error.problem.kind }));
        }
        const page = read.value;
        return scope.proceed({ page, picture: await readPagePicture(page, input.picture) });
      },
      reserve: (tx, viewer, pending) => reservePagePicture(tx, viewer, pending),
      store: (reserved) => storePagePicture(reserved),
    },
    async (scope, { page, picture }) => {
      const id = page.mfcItemId;
      const ensured = await addMfcItemIfMissing(scope.tx, scope.viewer, page, picture);
      if (ensured.isErr()) {
        if (ensured.error._tag === "ItemDatabaseFull") {
          scope.log.set({ mfc: { itemId: id, outcome: "database_full" } });
        }
        return ensured;
      }
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
