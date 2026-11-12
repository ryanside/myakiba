import { tagged } from "./tagged";

/** Elysia's 422. Its body is validator JSON, never a message written for users. */
export class ApiInvalid extends tagged("ApiInvalid")<{
  readonly body: unknown;
  readonly message: string;
}> {}
