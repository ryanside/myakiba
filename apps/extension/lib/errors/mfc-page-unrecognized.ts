import type { MfcItemId } from "@myakiba/mfc/page";
import { tagged } from "./tagged";

export class MfcPageUnrecognized extends tagged("MfcPageUnrecognized")<{
  mfcItemId: MfcItemId;
  status: number;
  message: string;
}> {
  constructor(args: { mfcItemId: MfcItemId; status: number }) {
    super({
      ...args,
      message: `MFC answered item ${args.mfcItemId} with status ${args.status} and a page that is neither the item, a not-found page nor a challenge. The item was not imported. Compare the page with readMfcEnvelope's markers.`,
    });
  }
}
