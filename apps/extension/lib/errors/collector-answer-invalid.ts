import type { StandardSchemaIssue } from "better-result";
import type { CollectRequest } from "../collect";
import { tagged } from "./tagged";

export class CollectorAnswerInvalid extends tagged("CollectorAnswerInvalid")<{
  tabId: number;
  kind: CollectRequest["kind"];
  issues: readonly StandardSchemaIssue[];
  message: string;
}> {
  constructor(args: {
    tabId: number;
    kind: CollectRequest["kind"];
    issues: readonly StandardSchemaIssue[];
  }) {
    const found = args.issues.map((issue) => issue.message).join("; ");
    super({
      ...args,
      message: `The ${args.kind} collector in tab ${args.tabId} gave no valid answer${found ? ` (${found})` : ""}, which is what a script that failed in the tab gives. An item page the extension asked for in its own tab closes that tab, and one asked for in a borrowed tab is tried once more in a tab of its own. Check the collector's console in that tab.`,
    });
  }
}
