import { summarize } from "./summary";
import { tagged } from "./tagged";

export class TabOpenFailed extends tagged("TabOpenFailed")<{
  windowId: number;
  cause: unknown;
  message: string;
}> {
  constructor(args: { windowId: number; cause: unknown }) {
    super({
      ...args,
      message: `The browser would not open a tab in window ${args.windowId}: ${summarize(args.cause).message}. The window may have closed. The item was not fetched. Check that the run's window is still open.`,
    });
  }
}
