import { tagged } from "./tagged";

/** The browser refused a clipboard write, such as without permission, focus or a secure page. */
export class ClipboardWriteFailed extends tagged("ClipboardWriteFailed")<{
  readonly cause: unknown;
  readonly message: string;
}> {
  constructor({ cause }: { readonly cause: unknown }) {
    super({ cause, message: cause instanceof Error ? cause.message : String(cause) });
  }
}
