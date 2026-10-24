import { tagged } from "./tagged";

export class ExtensionMissing extends tagged("ExtensionMissing")<{
  kind: "absent" | "outdated";
  version: string | null;
  message: string;
}> {
  constructor(args: { kind: "absent"; version: null } | { kind: "outdated"; version: string }) {
    super({
      ...args,
      message:
        args.kind === "absent"
          ? "No myakiba extension answered the page's hello, so the user is asked to install it."
          : `The myakiba extension ${args.version} speaks no bridge protocol this page speaks, so the user is asked to update it.`,
    });
  }
}
