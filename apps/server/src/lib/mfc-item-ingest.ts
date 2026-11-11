import { Result } from "better-result";
import type { ItemRefresh, ItemUpload } from "@myakiba/contracts/mfc-items/schema";
import type { ReadTx } from "@myakiba/db/tx";
import type { Viewer } from "@/domain/viewer";
import type { MfcItemId } from "@myakiba/mfc/page";
import { parseMfcItemPage } from "@myakiba/mfc/parse";
import type { MfcItemPage, MfcPageUnreadable } from "@myakiba/mfc/parse";
import { findMfcItem, pictureFits } from "@/lib/item-database";
import { itemImages } from "@/lib/item-images";
import type { PictureOutcome, StoredPicture } from "@/lib/item-images";
import { StoreItemPictureFailed } from "@/lib/errors/store-item-picture-failed";

type ParsedMfcItem = {
  readonly kind: "parsed";
  readonly page: MfcItemPage;
  readonly picture: StoredPicture | null;
};

type PreparedMfcItem =
  | { readonly kind: "existing"; readonly mfcItemId: MfcItemId; readonly itemId: string }
  | ParsedMfcItem;

/**
 * Parses the page and stores its picture at its content's key, unless it would not fit in the
 * viewer's quota. Run it before any transaction opens: a stored picture is never rolled back.
 * `replacing` is the Item an Item Refresh updates.
 */
export async function readMfcItemPage(
  pool: ReadTx,
  viewer: Viewer,
  id: MfcItemId,
  upload: ItemRefresh,
  replacing?: string,
): Promise<Result<ParsedMfcItem, MfcPageUnreadable | StoreItemPictureFailed>> {
  const html = upload.page instanceof File ? await upload.page.text() : upload.page;
  const parsed = parseMfcItemPage(html, id);
  if (parsed.isErr()) return Result.err(parsed.error);
  const page = parsed.value;
  const { picture } = upload;
  if (!page.picture || !picture) return Result.ok({ kind: "parsed", page, picture: null });
  const prepared = await Result.tryPromise({
    try: () =>
      itemImages.store(picture, (image, bytes) =>
        pictureFits(pool, viewer, { image, bytes, replacing }),
      ),
    catch: (cause) => new StoreItemPictureFailed({ mfcItemId: id, cause }),
  });
  return prepared.map((ready) => ({ kind: "parsed", page, picture: ready }));
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
  return readMfcItemPage(pool, viewer, id, upload);
}

/** What the request log says about a page the parser refused, with the limit and size a too_large page went past. */
export function refusedPageLog({ mfcItemId, problem }: MfcPageUnreadable) {
  return problem.kind === "too_large"
    ? { itemId: mfcItemId, outcome: problem.kind, limit: problem.limit, measured: problem.measured }
    : { itemId: mfcItemId, outcome: problem.kind };
}

/** What the request log says about the picture a save was sent and what the writer did with it. */
export const pictureLog = (picture: StoredPicture | null, outcome: PictureOutcome) =>
  picture?.kind === "rejected" ? `rejected: ${picture.reason}` : outcome;
