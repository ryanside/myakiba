import type { MfcItemId } from "../page";
import type { MfcPageProblem } from "../parse";
import { tagged } from "./tagged";

/** The HTML is not a readable MFC page for the item that was asked for. `problem` says why. */
export class MfcPageUnreadable extends tagged("MfcPageUnreadable")<{
  readonly mfcItemId: MfcItemId;
  readonly problem: MfcPageProblem;
  readonly message: string;
}> {
  constructor(args: { readonly mfcItemId: MfcItemId; readonly problem: MfcPageProblem }) {
    super({
      ...args,
      message: `The page for MFC item ${args.mfcItemId} could not be read as that item (${args.problem.kind}), so nothing was parsed from it.`,
    });
  }
}
