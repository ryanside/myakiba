// Request functions answer a better-result Result. scripts/replay.ts also runs the tests that
// fake them against revisions from before that, which have no data/api.ts, where a request
// function answered its value and rejected on failure. These helpers speak both.
const answersResults = await import("@/data/api").then(
  () => true,
  () => false,
);
const { Result } = answersResults ? await import("better-result") : { Result: null };

/** What a faked request function answers when its write or read succeeds. */
export function answer<Value>(value: Value) {
  return Result ? Result.ok(value) : value;
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
