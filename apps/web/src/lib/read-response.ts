import { getUserErrorMessage } from "./treaty-client";

type ApiError = Parameters<typeof getUserErrorMessage>[0];
type ReadResponse<Data> =
  | { readonly data: Data; readonly error: null }
  | { readonly data: null; readonly error: ApiError };

export class ReadError extends Error {
  readonly userMessage: string | undefined;

  constructor(message: string, error?: ApiError) {
    super(message);
    this.name = "ReadError";
    this.userMessage = error ? getUserErrorMessage(error) : undefined;
  }
}

export async function readResponse<Data>(
  response: PromiseLike<ReadResponse<Data>>,
  fallback: string,
): Promise<NonNullable<Data>> {
  const { data, error } = await response;
  if (error) throw new ReadError(fallback, error);
  if (data === null || data === undefined) throw new ReadError(fallback);
  return data;
}
