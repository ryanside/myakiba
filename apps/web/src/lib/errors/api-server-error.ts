import { tagged } from "./tagged";

/** A real answer at 500 or above. A kernel 500 carries the operation's failure text. */
export class ApiServerError extends tagged("ApiServerError")<{
  readonly status: number;
  readonly body: unknown;
  readonly message: string;
}> {}
