import { tagged } from "./tagged";

/** The routes or the server data did not reload after the signed-in account changed. */
export class SessionReloadFailed extends tagged("SessionReloadFailed")<{
  readonly cause: unknown;
  readonly message: string;
}> {
  constructor({ cause }: { readonly cause: unknown }) {
    super({ cause, message: "Couldn't update your session. Refresh to try again." });
  }
}
