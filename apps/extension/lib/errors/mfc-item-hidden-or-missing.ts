import type { MfcItemId } from "@myakiba/mfc/page";
import { tagged } from "./tagged";

export class MfcItemHiddenOrMissing extends tagged("MfcItemHiddenOrMissing")<{
  mfcItemId: MfcItemId;
  message: string;
}> {
  constructor(args: { mfcItemId: MfcItemId }) {
    super({
      ...args,
      message: `MFC answered item ${args.mfcItemId} as not found to a signed-in session, so the item is hidden or deleted. The item was not refreshed. Check the id on MFC.`,
    });
  }
}
