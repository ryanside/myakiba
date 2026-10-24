import { tagged } from "./tagged";

/**
 * Better Auth refused a request, or the request never reached it. `code` and `status` are Better
 * Auth's, and both are null when nothing answered. `message` is the server's text, or empty.
 */
export class AuthRequestFailed extends tagged("AuthRequestFailed")<{
  readonly code: string | null;
  readonly status: number | null;
  readonly cause: unknown;
  readonly message: string;
}> {}
