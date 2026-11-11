import { Result } from "better-result";
import type { ItemRefresh, ItemUpload } from "@myakiba/contracts/mfc-items/schema";
import type { ReadTx } from "@myakiba/db/tx";
import type { Viewer } from "@/domain/viewer";
import type { MfcItemId } from "@myakiba/mfc/page";
import { parseMfcItemPage } from "@myakiba/mfc/parse";
import type { MfcItemPage, MfcPageUnreadable } from "@myakiba/mfc/parse";
import { findMfcItem } from "@/lib/item-database";
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
  viewer: Viewer,
  upload: ItemUpload,
): Promise<Result<PreparedMfcItem, MfcPageUnreadable | StoreItemPictureFailed>> {
  const id = upload.mfcItemId as MfcItemId;
  const existingId = await findMfcItem(pool, viewer, id);
  if (existingId) return Result.ok({ kind: "existing", mfcItemId: id, itemId: existingId });
  return readMfcItemPage(id, upload);
}

export const pictureOutcome = (stored: StoredPicture | null): PictureOutcome =>
  stored?.kind ?? "absent";

export const pictureLog = (stored: StoredPicture | null) =>
  stored?.kind === "rejected" ? `rejected: ${stored.reason}` : pictureOutcome(stored);
