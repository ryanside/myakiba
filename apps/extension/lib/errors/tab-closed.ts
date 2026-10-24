import { summarize } from "./summary";
import { tagged } from "./tagged";

export class TabClosed extends tagged("TabClosed")<{
  tabId: number;
  cause: unknown;
  message: string;
}> {
  constructor(args: { tabId: number; cause: unknown }) {
    super({
      ...args,
      message: `The browser has no tab ${args.tabId} any more (${summarize(args.cause).message}), so the user or the browser closed it. The extension stops using it. If it was the run's own tab, the run's items fail.`,
    });
  }
}
