import type { MfcItemId } from "@myakiba/mfc/page";
import { tagged } from "@/domain/tagged";

/** The item insert wrote no row and no other upload's row exists, so the item was not saved. */
export class MfcItemNotPersisted extends tagged("MfcItemNotPersisted")<{
  readonly mfcItemId: MfcItemId;
  readonly message: string;
}> {
  constructor(args: { readonly mfcItemId: MfcItemId }) {
    super({
      ...args,
      message: `MFC item ${args.mfcItemId} was neither created nor found, so the transaction saved nothing for it.`,
    });
  }
}
