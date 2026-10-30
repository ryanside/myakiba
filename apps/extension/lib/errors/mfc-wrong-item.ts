import type { MfcItemId } from "@myakiba/mfc/page";
import { tagged } from "./tagged";

export class MfcWrongItem extends tagged("MfcWrongItem")<{
  expected: MfcItemId;
  found: MfcItemId;
  message: string;
}> {
  constructor(args: { expected: MfcItemId; found: MfcItemId }) {
    super({
      ...args,
      message: `MFC answered item ${args.expected} with item ${args.found}'s page. The item was not refreshed. Check the page's canonical link parsing.`,
    });
  }
}
