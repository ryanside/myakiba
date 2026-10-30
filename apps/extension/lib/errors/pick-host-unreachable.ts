import { summarize } from "./summary";
import { tagged } from "./tagged";

export class PickHostUnreachable extends tagged("PickHostUnreachable")<{
  cause: unknown;
  message: string;
}> {
  constructor(args: { cause: unknown }) {
    super({
      ...args,
      message: `The MFC page could not reach the extension's background: ${summarize(args.cause).message}. The page's pick did not change. An extension update or removal does this, and reloading the page reaches the new one.`,
    });
  }
}
