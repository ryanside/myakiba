import { tagged } from "./tagged";

/** No response arrived. Eden answers a fetch that threw with a synthetic 503 whose value is `cause`. */
export class ApiUnreachable extends tagged("ApiUnreachable")<{
  readonly cause: unknown;
  readonly message: string;
}> {}
