import { summarize } from "./summary";
import { tagged } from "./tagged";

export class SessionStorageUnavailable extends tagged("SessionStorageUnavailable")<{
  key: string;
  op: "get" | "set";
  cause: unknown;
  message: string;
}> {
  constructor(args: { key: string; op: "get" | "set"; cause: unknown }) {
    super({
      ...args,
      message: `storage.session would not ${args.op} ${args.key}: ${summarize(args.cause).message}. ${args.op === "get" ? "The worker starts it from its starting value" : "The worker keeps the change, but a restarted worker will not see it"}. Check the browser's storage quota and the extension's storage permission.`,
    });
  }
}
