import type { MfcItemId } from "@myakiba/mfc/page";
import { tagged } from "@/domain/tagged";

/** S3 did not take an item's picture in time, so the item was not ingested. */
export class StoreItemPictureFailed extends tagged("StoreItemPictureFailed")<{
  readonly mfcItemId: MfcItemId;
  readonly cause: unknown;
  readonly message: string;
}> {
  constructor(args: { readonly mfcItemId: MfcItemId; readonly cause: unknown }) {
    super({
      ...args,
      message: `Storing the picture of MFC item ${args.mfcItemId} failed, so the item was not ingested. Retry once S3 answers.`,
    });
  }
}
