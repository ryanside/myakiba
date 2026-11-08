import { summarize } from "./summary";
import { tagged } from "./tagged";

export class WindowFocusRefused extends tagged("WindowFocusRefused")<{
  windowId: number;
  cause: unknown;
  message: string;
}> {
  constructor(args: { windowId: number; cause: unknown }) {
    super({
      ...args,
      message: `The browser would not focus window ${args.windowId}: ${summarize(args.cause).message}. The window may have closed. The tab it holds was not brought forward.`,
    });
  }
}
