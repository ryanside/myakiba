import { mfcItemUrl } from "@myakiba/contracts/add/constants";
import { ApiRejected } from "@/lib/errors/api-rejected";

/** Why a pick is not in the Item Database yet. Every kind but `stopped` keeps the pick for a retry. */
export type PickFailure =
  | { readonly kind: "rejected"; readonly message: string }
  | { readonly kind: "unverified" }
  | { readonly kind: "busy" }
  | { readonly kind: "unsaved" }
  | { readonly kind: "stopped" };

type PickAction =
  | { readonly kind: "retry" }
  | { readonly kind: "open"; readonly label: string; readonly href: string }
  | { readonly kind: "resend-verification" };

/** What a failed pick upload means for the pick. A 400 is the server's reason the page cannot be read. */
export function pickFailureOf(cause: unknown): PickFailure {
  if (!ApiRejected.is(cause)) return { kind: "unsaved" };
  if (cause.status === 400) return { kind: "rejected", message: cause.message };
  if (cause.status === 403) return { kind: "unverified" };
  if (cause.status === 429) return { kind: "busy" };
  return { kind: "unsaved" };
}

export const EXTENSION_STOPPED_TEXT = "The extension stopped. Reload the page to see your picks.";

const RETRY: PickAction = { kind: "retry" };

type PickFailureCopy = { readonly text: string; readonly actions: readonly PickAction[] };

export function pickFailureCopy(failure: PickFailure, mfcItemId: number): PickFailureCopy {
  switch (failure.kind) {
    case "rejected":
      return {
        text: failure.message,
        actions: [RETRY, { kind: "open", label: "Open on MFC", href: mfcItemUrl(mfcItemId) }],
      };
    case "unverified":
      return {
        text: "Verify your email to add these.",
        actions: [{ kind: "resend-verification" }],
      };
    case "busy":
      return {
        text: "You've added a lot of items this hour. Try again in a few minutes.",
        actions: [RETRY],
      };
    case "unsaved":
      return { text: "myakiba could not save this item.", actions: [RETRY] };
    case "stopped":
      return { text: EXTENSION_STOPPED_TEXT, actions: [] };
  }
}
