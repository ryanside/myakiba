import type { CollectRequest } from "../collect";
import { summarize } from "./summary";
import { afterCollectorFailure } from "./after-collector-failure";
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
      message: `The browser would not run the ${args.kind} collector in tab ${args.tabId}: ${summarize(args.cause).message}. The tab may have closed or show the browser's error page. ${afterCollectorFailure(args.kind)} Check the tab and the host permissions.`,
    });
  }
}
