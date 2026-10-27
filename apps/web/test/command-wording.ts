import type { FailureToast } from "@/data/client";

// A command words its failure toast with failureToast. scripts/replay.ts also runs the tests that
// build a command against revisions from before that, where a command read failureTitle and
// failureDescription. This wording speaks both.
export function failureWording<Input>(title: string, describe?: (failure: Error) => string) {
  return {
    failureToast: (_input: Input, failure: Error | null): FailureToast => ({
      title,
      ...(failure && describe && { description: describe(failure) }),
    }),
    failureTitle: () => title,
    ...(describe && { failureDescription: (_input: Input, failure: Error) => describe(failure) }),
  };
}
