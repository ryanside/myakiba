import * as z from "zod";

/** Eden's error: the status and parsed body, or 503 and the thrown error when no response arrived. */
type ApiError = { readonly status: number; readonly value: unknown };

export type ApiResponse<Data> =
  | { readonly data: Data; readonly error: null; readonly status: number }
  | { readonly data: null; readonly error: ApiError; readonly status: number };

/** A request that failed. `message` is the diagnostic; `userMessageOf` gives the text a user may see. */
export class ReadError extends Error {
  override readonly name = "ReadError";
  readonly status: number;

  constructor(message: string, status: number, options?: ErrorOptions) {
    super(message, options);
    this.status = status;
  }
}

/** Resolves to the response's data, or rejects with a `ReadError` whose message is `fallback`. */
export async function sendRequest<Data>(
  response: ApiResponse<Data> | PromiseLike<ApiResponse<Data>>,
  fallback: string,
): Promise<Data> {
  const { data, error } = await response;
  if (error) throw new ReadError(fallback, error.status, { cause: error.value });
  return data;
}

/** Like `sendRequest`, and an answer without data is a failure too. */
export async function readResponse<Data>(
  response: ApiResponse<Data> | PromiseLike<ApiResponse<Data>>,
  fallback: string,
): Promise<NonNullable<Data>> {
  const answer = await response;
  const data = await sendRequest(answer, fallback);
  if (data === null || data === undefined) throw new ReadError(fallback, answer.status);
  return data;
}

/** A visible character: not whitespace and not an invisible format character such as U+200B. */
const serverMessage = z.string().regex(/[^\s\p{Cf}]/u);

/** Only a 4xx text body with visible text is a message the server wrote for the user. */
export function userMessageOf(error: Error | null): string | undefined {
  if (!(error instanceof ReadError) || error.status < 400 || error.status >= 500) return undefined;
  const message = serverMessage.safeParse(error.cause);
  return message.success ? message.data : undefined;
}

const NO_ANSWER_MESSAGE = "The server didn't answer.";

/** The server's message for the user, or `fallback` when it wrote none. */
export function shownMessageOf(error: Error | null, fallback = NO_ANSWER_MESSAGE): string {
  return userMessageOf(error) ?? fallback;
}
