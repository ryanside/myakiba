import type { MfcItemId } from "@myakiba/mfc/page";
import { tagged } from "./tagged";

export type CaptureRefusal = "not_an_item_page" | "wrong_item" | "sfw_hidden";

const WHY = {
  not_an_item_page: "the scrubbed page does not read as an MFC Item page",
  wrong_item: "the page's canonical link names another Item",
  sfw_hidden: "MFC replaced the Item's picture with its SFW placeholder",
} as const satisfies Record<CaptureRefusal, string>;

export class CaptureRefused extends tagged("CaptureRefused")<{
  mfcItemId: MfcItemId;
  reason: CaptureRefusal;
  message: string;
}> {
  constructor(args: { mfcItemId: MfcItemId; reason: CaptureRefusal }) {
    super({
      ...args,
      message: `The content script did not pick item ${args.mfcItemId}, because ${WHY[args.reason]}. Nothing was stored. The page tells the user what to do.`,
    });
  }
}
