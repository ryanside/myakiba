import { tagged } from "./tagged";

/** The browser could not read the chosen export. Its message is the browser's. */
export class ExportFileUnreadable extends tagged("ExportFileUnreadable")<{
  readonly cause: unknown;
  readonly message: string;
}> {
  constructor({ cause }: { readonly cause: unknown }) {
    super({
      cause,
      message: cause instanceof Error ? cause.message : "This export could not be read.",
    });
  }
}
