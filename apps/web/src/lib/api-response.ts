import * as z from "zod";

/** Eden's error: the status and parsed body, or 503 and the thrown error when no response arrived. */
type EdenError = { readonly status: number; readonly value: unknown };

export type ApiResponse<Data> =
  | { readonly data: Data; readonly error: null; readonly status: number }
  | { readonly data: null; readonly error: EdenError; readonly status: number };

/** A request that failed. `message` is the diagnostic; `shownMessageOf` gives the text a user may see. */
export class ApiError extends Error {
  override readonly name = "ApiError";
  readonly status: number;

  constructor(message: string, status: number, options?: ErrorOptions) {
    super(message, options);
    this.status = status;
  }
}

/**
 * Resolves to the response's data, which may be empty, or rejects with an `ApiError` whose message
 * is `fallback`.
 */
export async function checkResponse<Data>(
  response: ApiResponse<Data> | PromiseLike<ApiResponse<Data>>,
  fallback: string,
): Promise<Data> {
  const { data, error } = await response;
  if (error) throw new ApiError(fallback, error.status, { cause: error.value });
  return data;
}

/** Like `checkResponse`, and an answer without data is a failure too. */
export async function requireData<Data>(
  response: ApiResponse<Data> | PromiseLike<ApiResponse<Data>>,
  fallback: string,
): Promise<NonNullable<Data>> {
  const answer = await response;
  const data = await checkResponse(answer, fallback);
  if (data === null || data === undefined) throw new ApiError(fallback, answer.status);
  return data;
}

/** A visible character: not whitespace and not an invisible format character such as U+200B. */
const serverMessage = z.string().regex(/[^\s\p{Cf}]/u);

function isRejection(error: Error | null): error is ApiError {
  return error instanceof ApiError && error.status >= 400 && error.status < 500;
}

/** Only a 4xx text body with visible text is a message the server wrote for the user. */
function userMessageOf(error: Error | null): string | undefined {
  if (!isRejection(error)) return undefined;
  const message = serverMessage.safeParse(error.cause);
  return message.success ? message.data : undefined;
}

const NO_ANSWER_MESSAGE = "The server didn't answer.";
const REJECTED_MESSAGE = "The server rejected this request.";

/**
 * The server's message for the user, else `fallback`, else a message for how the request failed:
 * a 4xx without text, such as a validation body, was rejected, and anything else got no answer.
 */
export function shownMessageOf(error: Error | null, fallback?: string): string {
  return (
    userMessageOf(error) ?? fallback ?? (isRejection(error) ? REJECTED_MESSAGE : NO_ANSWER_MESSAGE)
  );
}
