import { summarize } from "./summary";
import { tagged } from "./tagged";

export class ExtensionContextInvalidated extends tagged("ExtensionContextInvalidated")<{
  cause: unknown;
  message: string;
}> {
  constructor(args: { cause: unknown }) {
    super({
      ...args,
      message: `The extension's runtime threw ${summarize(args.cause).message}, so the extension reloaded or was removed under the page. The bridge detaches and ends every open run as interrupted. Reload the page to reach the extension again.`,
    });
  }
}
