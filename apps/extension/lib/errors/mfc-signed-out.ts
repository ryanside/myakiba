import type { MfcItemId } from "@myakiba/mfc/page";
import { tagged } from "./tagged";

export class MfcSignedOut extends tagged("MfcSignedOut")<{
  mfcItemId: MfcItemId;
  message: string;
}> {
  constructor(args: { mfcItemId: MfcItemId }) {
    super({
      ...args,
      message: `MFC answered item ${args.mfcItemId} with a 404 and no user menu, so the browser's MFC session is signed out. The item was not refreshed. Sign in to MFC and refresh it again.`,
    });
  }
}
