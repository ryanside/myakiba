import { tagged } from "./tagged";

/**
 * The answer could not be read. Either Eden rejected while reading the body, with `cause` set,
 * or a call that requires data got an empty 2xx, with `cause` null. `message` is the call's own
 * text, never the reader's.
 */
export class ApiUnreadable extends tagged("ApiUnreadable")<{
  readonly cause: unknown;
  readonly message: string;
}> {}
