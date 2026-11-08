import type { MfcItemId } from "@myakiba/mfc/page";
import { summarize } from "./summary";
import { tagged } from "./tagged";

export class MfcChallengeUnsolved extends tagged("MfcChallengeUnsolved")<{
  mfcItemId: MfcItemId;
  reason: "not_shown" | "unanswered";
  cause: unknown;
  message: string;
}> {
  constructor(args: { mfcItemId: MfcItemId; reason: "not_shown" | "unanswered"; cause?: unknown }) {
    const what =
      args.reason === "not_shown"
        ? `the extension could not show its tab (${summarize(args.cause).message})`
        : "its window ended or its tab closed before the tab showed the item";
    super({
      ...args,
      cause: args.cause,
      message: `MFC's challenge for item ${args.mfcItemId} went unsolved because ${what}. Every open run fails its items, so nobody is asked again. Start the refresh again to get a new challenge.`,
    });
  }
}
