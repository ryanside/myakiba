import { summarize } from "./summary";
import { tagged } from "./tagged";

export class TabQueryFailed extends tagged("TabQueryFailed")<{
  cause: unknown;
  message: string;
}> {
  constructor(args: { cause: unknown }) {
    super({
      ...args,
      message: `The browser would not list the open MFC tabs: ${summarize(args.cause).message}. The item was not fetched. Check the extension's tabs permission.`,
    });
  }
}
