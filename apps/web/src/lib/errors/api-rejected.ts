import { tagged } from "./tagged";

/** Any other answer below 500 that Eden reads as an error: 3xx, 400, 401, 403, 409, 413, 429. */
export class ApiRejected extends tagged("ApiRejected")<{
  readonly status: number;
  readonly body: unknown;
  readonly message: string;
}> {}
