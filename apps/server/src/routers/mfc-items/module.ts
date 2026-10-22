import { and, eq, inArray } from "drizzle-orm";
import type { ItemUpload, MissingItemsInput } from "@myakiba/contracts/mfc-items/schema";
import { item } from "@myakiba/db/schema/figure";
import type { MfcItemId } from "@myakiba/mfc/page";
import { command, fail, ok, proceed, query } from "@/domain/kernel";
import { ensureMfcItem, prepareMfcItem } from "./ingest";

type PictureOutcome = "stored" | "absent" | "rejected";

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
      return ok({ missing: input.mfcItemIds.filter((id) => !existing.has(id)) });
    },
  ),

  ingest: command(
    {
      action: "mfc_items.ingest",
      failure: "Failed to import item",
      before: async (scope, input: ItemUpload) => {
        const prepared = await prepareMfcItem(scope.tx, input);
        if (prepared.kind === "parsed") return proceed(prepared);
        scope.log.set({
          mfc: {
            itemId: prepared.mfcItemId,
            outcome: prepared.kind === "existing" ? "existing" : prepared.problem,
          },
        });
        if (prepared.kind === "unreadable") return fail("bad_request", prepared.message);
        return ok<IngestResult>({
          saved: "existing",
          itemId: prepared.itemId,
          mfcItemId: prepared.mfcItemId,
        });
      },
    },
    async (scope, { page, stored }) => {
      const id = page.mfcItemId;
      const picture: PictureOutcome = stored?.kind ?? "absent";
      const { itemId, created } = await ensureMfcItem(scope.tx, page, stored);

      scope.log.set({
        mfc: {
          itemId: id,
          contentLabel: page.contentLabel,
          outcome: created ? "created" : "existing",
          picture: stored?.kind === "rejected" ? `rejected: ${stored.reason}` : picture,
          warnings: page.warnings,
        },
      });
      return ok<IngestResult>(
        created
          ? { saved: "created", itemId, mfcItemId: id, picture }
          : { saved: "existing", itemId, mfcItemId: id },
      );
    },
  ),
};
