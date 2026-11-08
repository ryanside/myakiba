import { tagged } from "./tagged";

/** The server answered 404. `body` is its text, when it sent one. */
export class ApiNotFound extends tagged("ApiNotFound")<{
  readonly body: unknown;
  readonly message: string;
}> {}
