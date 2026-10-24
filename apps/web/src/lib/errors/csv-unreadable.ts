import { tagged } from "./tagged";

/** The browser could not read the chosen CSV, such as a file moved after it was chosen. Its message is the browser's. */
export class CsvUnreadable extends tagged("CsvUnreadable")<{
  readonly cause: unknown;
  readonly message: string;
}> {
  constructor({ cause }: { readonly cause: unknown }) {
    super({ cause, message: cause instanceof Error ? cause.message : String(cause) });
  }
}
