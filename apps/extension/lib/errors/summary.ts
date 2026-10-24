/** An error's name and message, which cross the collector boundary where the error itself cannot. */
export type ErrorSummary = { readonly name: string; readonly message: string };

export function summarize(cause: unknown): ErrorSummary {
  return cause instanceof Error
    ? { name: cause.name, message: cause.message }
    : { name: "thrown value", message: String(cause) };
}
