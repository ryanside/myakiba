import { tagged } from "./tagged";

/**
 * Better Auth refused a request, or the request never reached it. `code` and `status` are Better
 * Auth's, and both are null when nothing answered. `statusText` is the response's status line and
 * `message` the server's text, each empty when there is none.
 */
export class AuthRequestFailed extends tagged("AuthRequestFailed")<{
  readonly code: string | null;
  readonly status: number | null;
  readonly statusText: string;
  readonly cause: unknown;
  readonly message: string;
}> {}
