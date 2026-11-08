import { summarize } from "./summary";
import { tagged } from "./tagged";

export class PickStorageFailed extends tagged("PickStorageFailed")<{
  area: "local" | "session";
  op: "read" | "write";
  cause: unknown;
  message: string;
}> {
  constructor(args: { area: "local" | "session"; op: "read" | "write"; cause: unknown }) {
    super({
      ...args,
      message: `storage.${args.area} would not ${args.op} the picks: ${summarize(args.cause).message}. ${args.op === "read" ? "The extension answers without them" : "The change was not kept"}. Check the browser's storage quota and the extension's storage permission.`,
    });
  }
}
