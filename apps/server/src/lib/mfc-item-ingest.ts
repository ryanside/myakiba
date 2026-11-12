import { Result } from "better-result";
import type { ItemRefresh } from "@myakiba/contracts/mfc-items/schema";
import type { Tx } from "@myakiba/db/tx";
import type { MfcItemId } from "@myakiba/mfc/page";
import { parseMfcItemPage } from "@myakiba/mfc/parse";
import type { MfcItemPage, MfcPageUnreadable } from "@myakiba/mfc/parse";
import type { Viewer } from "@/domain/viewer";
import { StoreItemPictureFailed } from "@/lib/errors/store-item-picture-failed";
import { reservePicture } from "@/lib/item-database";
import { itemImages } from "@/lib/item-images";
import type { PictureOutcome, ReadPicture, SavedPicture } from "@/lib/item-images";

/** A page's picture before it is stored: read and keyed by its bytes, or already left out. */
type PendingPicture = ReadPicture | Extract<SavedPicture, { readonly kind: "rejected" }> | null;

type Pending = { readonly page: MfcItemPage; readonly picture: PendingPicture };

type WithPicture<T, P> = Omit<T, "picture"> & { readonly picture: P };

export async function readMfcItemPage(
  id: MfcItemId,
  upload: ItemRefresh,
): Promise<Result<MfcItemPage, MfcPageUnreadable>> {
  const html = upload.page instanceof File ? await upload.page.text() : upload.page;
  return parseMfcItemPage(html, id);
}

export async function readPagePicture(
  page: MfcItemPage,
  upload: ItemRefresh["picture"],
): Promise<PendingPicture> {
  if (!page.picture || !upload) return null;
  return itemImages.read(upload);
}

/** A save's `reserve`: records a read picture in the viewer's ledger, or leaves it out over the quota. */
export async function reservePagePicture<T extends Pending>(
  tx: Tx,
  viewer: Viewer,
  pending: T,
): Promise<WithPicture<T, PendingPicture>> {
  const { picture } = pending;
  if (picture?.kind !== "read") return pending;
  const reserved = await reservePicture(tx, viewer, {
    key: picture.key,
    bytes: picture.body.byteLength,
  });
  if (reserved === "reserved") return pending;
  return { ...pending, picture: { kind: "rejected", reason: "over_quota" } };
}

/** A save's `store`: puts a reserved picture in the bucket. */
export async function storePagePicture<T extends Pending>(
  pending: T,
): Promise<Result<WithPicture<T, SavedPicture | null>, StoreItemPictureFailed>> {
  const { picture } = pending;
  if (picture?.kind !== "read") return Result.ok({ ...pending, picture });
  const stored = await Result.tryPromise({
    try: () => itemImages.store(picture),
    catch: (cause) => new StoreItemPictureFailed({ mfcItemId: pending.page.mfcItemId, cause }),
  });
  return stored.map(() => ({ ...pending, picture: { kind: "stored", key: picture.key } }));
}

/** What the request log says about a page the parser refused, with the limit and size a too_large page went past. */
export function refusedPageLog({ mfcItemId, problem }: MfcPageUnreadable) {
  return problem.kind === "too_large"
    ? { itemId: mfcItemId, outcome: problem.kind, limit: problem.limit, measured: problem.measured }
    : { itemId: mfcItemId, outcome: problem.kind };
}

export const pictureLog = (picture: SavedPicture | null, outcome: PictureOutcome) =>
  picture?.kind === "rejected" ? `rejected: ${picture.reason}` : outcome;
