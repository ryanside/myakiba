import { Result } from "better-result";
import type { ItemRefresh, ItemUpload } from "@myakiba/contracts/mfc-items/schema";
import type { ReadTx, Tx } from "@myakiba/db/tx";
import type { Viewer } from "@/domain/viewer";
import type { MfcItemId } from "@myakiba/mfc/page";
import { parseMfcItemPage } from "@myakiba/mfc/parse";
import type { MfcItemPage, MfcPageUnreadable } from "@myakiba/mfc/parse";
import { ItemDatabaseFull } from "@/lib/errors/item-database-full";
import { StoreItemPictureFailed } from "@/lib/errors/store-item-picture-failed";
import { findMfcItem, itemDatabaseIsFull, reservePicture } from "@/lib/item-database";
import { itemImages } from "@/lib/item-images";
import type { PictureOutcome, SavedPicture } from "@/lib/item-images";

/** What a command's `before` lends a save: the pool, the viewer, and its one committed write. */
type SaveScope = {
  readonly tx: ReadTx;
  readonly viewer: Viewer;
  readonly commitFirst: <T>(write: (tx: Tx) => Promise<T>) => Promise<T>;
};

type ParsedMfcItem = {
  readonly kind: "parsed";
  readonly page: MfcItemPage;
  readonly picture: SavedPicture | null;
};

type PreparedMfcItem =
  | { readonly kind: "existing"; readonly mfcItemId: MfcItemId; readonly itemId: string }
  | ParsedMfcItem;

/**
 * Records the picture in the viewer's ledger, then stores it, unless the ledger is past the
 * quota. The row commits first, so every stored picture counts against its owner even when the
 * save later fails. Nothing here runs inside the save's transaction.
 */
async function savePicture(
  scope: SaveScope,
  id: MfcItemId,
  upload: Blob,
): Promise<Result<SavedPicture, StoreItemPictureFailed>> {
  const read = await itemImages.read(upload);
  if (read.kind === "rejected") return Result.ok(read);
  const reserved = await scope.commitFirst((tx) =>
    reservePicture(tx, scope.viewer, { key: read.key, bytes: read.body.byteLength }),
  );
  if (reserved === "over_quota") return Result.ok({ kind: "rejected", reason: "over_quota" });
  // Stored every time: the upload is keyed by its content, so it is idempotent, and it puts back
  // an object that went missing even when an Item already shows its key.
  const stored = await Result.tryPromise({
    try: () => itemImages.store(read),
    catch: (cause) => new StoreItemPictureFailed({ mfcItemId: id, cause }),
  });
  return stored.map(() => ({ kind: "stored", key: read.key }));
}

/** Parses the page, then records and stores its picture. Run it in `before`, outside the transaction. */
export async function readMfcItemPage(
  scope: SaveScope,
  id: MfcItemId,
  upload: ItemRefresh,
): Promise<Result<ParsedMfcItem, MfcPageUnreadable | StoreItemPictureFailed>> {
  const html = upload.page instanceof File ? await upload.page.text() : upload.page;
  const parsed = parseMfcItemPage(html, id);
  if (parsed.isErr()) return Result.err(parsed.error);
  const page = parsed.value;
  const { picture } = upload;
  if (!page.picture || !picture) return Result.ok({ kind: "parsed", page, picture: null });
  const saved = await savePicture(scope, id, picture);
  return saved.map((ready) => ({ kind: "parsed", page, picture: ready }));
}

/**
 * The slow half of an ingest: an Item the viewer already holds answers at once, a full Item
 * Database is refused before anything is recorded or stored, and otherwise the page is read.
 */
export async function prepareMfcItem(
  scope: SaveScope,
  upload: ItemUpload,
): Promise<Result<PreparedMfcItem, MfcPageUnreadable | StoreItemPictureFailed | ItemDatabaseFull>> {
  const id = upload.mfcItemId as MfcItemId;
  const existingId = await findMfcItem(scope.tx, scope.viewer, id);
  if (existingId) return Result.ok({ kind: "existing", mfcItemId: id, itemId: existingId });
  if (await itemDatabaseIsFull(scope.tx, scope.viewer)) return Result.err(new ItemDatabaseFull());
  return readMfcItemPage(scope, id, upload);
}

/** What the request log says about a page the parser refused, with the limit and size a too_large page went past. */
export function refusedPageLog({ mfcItemId, problem }: MfcPageUnreadable) {
  return problem.kind === "too_large"
    ? { itemId: mfcItemId, outcome: problem.kind, limit: problem.limit, measured: problem.measured }
    : { itemId: mfcItemId, outcome: problem.kind };
}

/** What the request log says about the picture a save was sent and what the writer did with it. */
export const pictureLog = (picture: SavedPicture | null, outcome: PictureOutcome) =>
  picture?.kind === "rejected" ? `rejected: ${picture.reason}` : outcome;
