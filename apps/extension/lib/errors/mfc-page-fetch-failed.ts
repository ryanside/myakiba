import type { MfcItemId } from "@myakiba/mfc/page";
import type { ErrorSummary } from "./summary";
import { tagged } from "./tagged";

export class MfcPageFetchFailed extends tagged("MfcPageFetchFailed")<{
  mfcItemId: MfcItemId;
  cause: ErrorSummary;
  message: string;
}> {
  constructor(args: { mfcItemId: MfcItemId; cause: ErrorSummary }) {
    super({
      ...args,
      message: `The collector's fetch of item ${args.mfcItemId} in the MFC tab failed with ${args.cause.name}: ${args.cause.message}. An item page the extension asked for in its own tab closes that tab, and one asked for in a borrowed tab is tried once more in a tab of its own. Check the network and MFC's availability.`,
    });
  }
}
