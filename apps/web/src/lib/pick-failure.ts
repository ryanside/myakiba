import { MFC_SETTINGS_URL, mfcItemUrl } from "@myakiba/contracts/add/constants";
import { ApiRejected } from "@/lib/errors/api-rejected";
import type { app } from "@/lib/treaty-client";

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

type IngestAnswer = Awaited<ReturnType<(typeof app.api)["mfc-items"]["post"]>>;
type PageRejection = Extract<NonNullable<IngestAnswer["error"]>, { status: 400 }>["value"];

// Typed against the server's 400 answers, so a reworded message fails the type check here.
const SFW_HIDDEN =
  "Turn off SFW mode in your MyFigureCollection settings to import this NSFW item" satisfies PageRejection;

/** What a failed pick upload means for the pick. A 400 is the server's reason the page cannot be read. */
export function pickFailureOf(cause: unknown): PickFailure {
  if (!ApiRejected.is(cause)) return { kind: "unsaved" };
  if (cause.status === 400) return { kind: "rejected", message: cause.message };
  if (cause.status === 403) return { kind: "unverified" };
  if (cause.status === 429) return { kind: "busy" };
  return { kind: "unsaved" };
}

const RETRY: PickAction = { kind: "retry" };

type PickFailureCopy = { readonly text: string; readonly actions: readonly PickAction[] };

export function pickFailureCopy(failure: PickFailure, mfcItemId: number): PickFailureCopy {
  switch (failure.kind) {
    case "rejected": {
      const actions: PickAction[] = [
        RETRY,
        { kind: "open", label: "Open on MFC", href: mfcItemUrl(mfcItemId) },
      ];
      if (failure.message === SFW_HIDDEN) {
        actions.push({ kind: "open", label: "Open MFC settings", href: MFC_SETTINGS_URL });
      }
      return { text: failure.message, actions };
    }
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
      return { text: "The extension stopped. Reload the page to see your picks.", actions: [] };
  }
}
