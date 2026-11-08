import type { StandardSchemaIssue } from "better-result";
import type { CollectRequest } from "../collect";
import { afterCollectorFailure } from "./after-collector-failure";
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
      message: `The ${args.kind} collector in tab ${args.tabId} gave no valid answer${found ? ` (${found})` : ""}, which is what a script that failed in the tab gives. ${afterCollectorFailure(args.kind)} Check the collector's console in that tab.`,
    });
  }
}
