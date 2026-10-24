import type { CollectRequest } from "../collect";
import { summarize } from "./summary";
import { tagged } from "./tagged";

export class CollectorInjectionFailed extends tagged("CollectorInjectionFailed")<{
  tabId: number;
  kind: CollectRequest["kind"];
  cause: unknown;
  message: string;
}> {
  constructor(args: { tabId: number; kind: CollectRequest["kind"]; cause: unknown }) {
    super({
      ...args,
      message: `The browser would not run the ${args.kind} collector in tab ${args.tabId}: ${summarize(args.cause).message}. The tab may have closed or show the browser's error page. An item page the extension asked for in its own tab closes that tab, and one asked for in a borrowed tab is tried once more in a tab of its own. Check the tab and the host permissions.`,
    });
  }
}
