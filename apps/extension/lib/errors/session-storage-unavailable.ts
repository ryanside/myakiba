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
      message: `storage.session would not ${args.op} ${args.key}: ${summarize(args.cause).message}. The step that needed it stopped, and what it would have recorded is lost. Check the browser's storage quota and the extension's storage permission.`,
    });
  }
}
