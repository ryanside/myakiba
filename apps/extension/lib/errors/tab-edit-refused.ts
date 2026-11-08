import { summarize } from "./summary";
import { tagged } from "./tagged";

export class TabEditRefused extends tagged("TabEditRefused")<{
  tabId: number;
  op: "update" | "remove";
  cause: unknown;
  message: string;
}> {
  constructor(args: { tabId: number; op: "update" | "remove"; cause: unknown }) {
    super({
      ...args,
      message: `The browser refused to ${args.op} tab ${args.tabId}: ${summarize(args.cause).message}. The tab closed, or the user is dragging a tab, during which Chrome edits none. Nothing changed in the tab.`,
    });
  }
}
