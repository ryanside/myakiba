import type { StandardSchemaIssue } from "better-result";
import { tagged } from "./tagged";

export class SessionValueInvalid extends tagged("SessionValueInvalid")<{
  key: string;
  issues: readonly StandardSchemaIssue[];
  message: string;
}> {
  constructor(args: { key: string; issues: readonly StandardSchemaIssue[] }) {
    super({
      ...args,
      message: `The ${args.key} stored in storage.session is missing or no longer fits its schema, as after an update or on a first run, so it reads as its starting value.`,
    });
  }
}
