import type { MfcItemId } from "@myakiba/mfc/page";
import { tagged } from "./tagged";

export class MfcRateLimited extends tagged("MfcRateLimited")<{
  mfcItemId: MfcItemId;
  status: number;
  pausedUntil: number;
  message: string;
}> {
  constructor(args: { mfcItemId: MfcItemId; status: number; pausedUntil: number }) {
    super({
      ...args,
      message: `MFC answered item ${args.mfcItemId} with ${args.status}, a rate limit. The queue backs off until ${new Date(args.pausedUntil).toISOString()} and tries the item again.`,
    });
  }
}
