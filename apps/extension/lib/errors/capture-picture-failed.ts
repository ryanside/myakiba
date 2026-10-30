import type { MfcItemId } from "@myakiba/mfc/page";
import { summarize } from "./summary";
import { tagged } from "./tagged";

export class CapturePictureFailed extends tagged("CapturePictureFailed")<{
  mfcItemId: MfcItemId;
  cause: unknown;
  message: string;
}> {
  constructor(args: { mfcItemId: MfcItemId; cause: unknown }) {
    super({
      ...args,
      message: `The picture of picked item ${args.mfcItemId} could not be read: ${summarize(args.cause).message}. The pick goes without it, and an Item Refresh can fetch it later. Check the commit picture URL on MFC.`,
    });
  }
}
