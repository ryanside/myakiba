// Request functions answer a better-result Result. scripts/replay.ts also runs the tests that
// fake them against revisions from before that, which have no data/api.ts, where a request
// function answered its value and rejected on failure. These helpers speak both.
const answersResults = await import("@/data/api").then(
  () => true,
  () => false,
);
const { Result } = answersResults ? await import("better-result") : { Result: null };
const { ApiServerError } = answersResults
  ? await import("@/lib/errors/api-server-error")
  : { ApiServerError: null };

/** What a faked request function answers when its write or read succeeds. */
export function answer<Value>(value: Value) {
  return Result ? Result.ok(value) : value;
}

/** What a faked request function answers when the server refuses it with a 500 and `message`. */
export function refusal(message: string) {
  if (Result && ApiServerError) {
    return Promise.resolve(Result.err(new ApiServerError({ status: 500, body: message, message })));
  }
  return Promise.reject(new Error(message));
}

type Settled = { readonly isErr: () => boolean; readonly error: Error };

const isSettled = <Outcome>(outcome: Outcome): outcome is Outcome & Settled =>
  typeof outcome === "object" && outcome !== null && "isErr" in outcome;

/** The failure a request or a write ended with, whether it rejected or answered an Err. */
export async function failureOf<Outcome>(request: Promise<Outcome>): Promise<Error> {
  let outcome: Outcome;
  try {
    outcome = await request;
  } catch (error) {
    return error as Error;
  }
  if (isSettled(outcome) && outcome.isErr()) return outcome.error;
  throw new Error("expected a failure");
}
