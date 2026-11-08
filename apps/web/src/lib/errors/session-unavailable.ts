import { tagged } from "./tagged";

/** The session check could not answer, so the app cannot tell whether anyone is signed in. */
export class SessionUnavailable extends tagged("SessionUnavailable")<{
  readonly message: string;
}> {
  constructor() {
    super({ message: "Couldn't check your session" });
  }
}
