import { mfcItemId } from "@myakiba/mfc/page";
import type { MfcItemId } from "@myakiba/mfc/page";
import { matchErrorPartial, Result } from "better-result";
import type { InferOk } from "better-result";
import { ExtensionStopped } from "@/lib/errors/extension-stopped";
import { InvalidMfcItemId } from "@/lib/errors/invalid-mfc-item-id";
import type { MfcItemFetchFailed } from "@/lib/errors/mfc-item-fetch-failed";
import { extensionBridge } from "@/lib/extension-bridge";
import { requireExtension } from "@/lib/extension-gate";
import type { ExtensionFetchEvent, ItemFetchFailure } from "@/lib/extension-bridge";
import { setExtensionPrompt } from "@/lib/extension-prompt";
import type { ExtensionPrompt } from "@/lib/extension-prompt";
import { requestResync } from "@/queries/item";
import type { ApiFailure } from "./api";
import { inUploadSlot } from "./upload-slots";

const QUEUED_PROMPT_DELAY_MS = 1000;

type StatusEvent = Extract<ExtensionFetchEvent, { readonly type: "status" }>;
type ItemError = MfcItemFetchFailed["code"];

const ITEM_ERROR_MESSAGE = {
  mfc_signed_out: "Sign in to MyFigureCollection to refresh this item",
  hidden_or_missing:
    "MyFigureCollection hides this item. Check your MyFigureCollection content settings",
  challenge_unsolved: "The MyFigureCollection security check was not completed",
  rate_limited: "MyFigureCollection asked us to slow down. Try again later",
  timeout: "MyFigureCollection took too long to answer",
  unexpected_page: "MyFigureCollection showed an unexpected page",
  extension_stopped: "The extension stopped. Reload the page and try again",
  unknown: "The extension could not fetch this item",
} as const satisfies Record<ItemError | "extension_stopped", string>;

type ItemPage = { readonly page: File; readonly picture?: File };

function itemPage(html: string, picture: Blob | null): ItemPage {
  const page = new File([html], "page.html", { type: "text/html" });
  if (picture === null) return { page };
  return { page, picture: new File([picture], "picture", { type: picture.type }) };
}

function promptFor(event: StatusEvent): ExtensionPrompt | null {
  switch (event.state) {
    case "queued":
      return { kind: "queued" };
    case "needs_user":
      return { kind: "needs_user", untilMs: event.untilMs };
    case "backing_off":
      return { kind: "backing_off", untilMs: event.untilMs };
    default:
      return null;
  }
}

async function fetchPageShowingPrompts(
  id: MfcItemId,
  signal: AbortSignal,
  onResponse: () => void,
): Promise<Result<ItemPage, ItemFetchFailure>> {
  const refreshId = `resync:${id}`;
  let queuedPromptTimer: ReturnType<typeof setTimeout> | undefined;
  const show = (prompt: ExtensionPrompt | null) => {
    clearTimeout(queuedPromptTimer);
    if (prompt?.kind === "queued") {
      setExtensionPrompt(refreshId, null);
      queuedPromptTimer = setTimeout(
        () => setExtensionPrompt(refreshId, prompt),
        QUEUED_PROMPT_DELAY_MS,
      );
    } else {
      setExtensionPrompt(refreshId, prompt);
    }
  };
  let fetched: Result<ItemPage, ItemFetchFailure> = Result.err(new ExtensionStopped());
  try {
    for await (const event of extensionBridge.fetchItems([id], { signal })) {
      onResponse();
      if (event.type === "status") {
        show(promptFor(event));
        continue;
      }
      show(null);
      fetched = event.result.map(({ html, picture }) => itemPage(html, picture));
    }
  } finally {
    show(null);
  }
  return fetched;
}

type RefreshFailure = InvalidMfcItemId | ItemFetchFailure;

type Resynced = InferOk<Awaited<ReturnType<typeof requestResync>>>;

/** The text an Item Refresh shows for its failure. A server answer shows its own message. */
export function refreshFailureText(failure: RefreshFailure | ApiFailure): string {
  return matchErrorPartial(
    failure,
    {
      InvalidMfcItemId: () => "Item not found",
      ExtensionStopped: () => ITEM_ERROR_MESSAGE.extension_stopped,
      MfcItemFetchFailed: ({ code }) => ITEM_ERROR_MESSAGE[code],
    },
    ({ message }) => message,
  );
}

type RefreshClock = {
  readonly after: (ms: number, fire: () => void) => () => void;
};

const refreshClock: RefreshClock = {
  after: (ms, fire) => {
    const timer = setTimeout(fire, ms);
    return () => clearTimeout(timer);
  },
};

async function fetchForRefresh(
  externalId: number,
  clock: RefreshClock,
): Promise<Result<ItemPage, RefreshFailure>> {
  const id = mfcItemId(externalId);
  if (id === null) return Result.err(new InvalidMfcItemId({ externalId }));
  const controller = new AbortController();
  let timedOut = false;
  const cancelDeadline = clock.after(5000, () => {
    timedOut = true;
    controller.abort();
  });
  try {
    // An answering extension may queue work or wait for the user's MFC security check.
    // Only silence before its first response means no content script answered this request.
    const fetched = await fetchPageShowingPrompts(id, controller.signal, cancelDeadline);
    if (timedOut) await requireExtension();
    return fetched;
  } finally {
    cancelDeadline();
  }
}

export async function refreshItemWithExtension(
  externalId: number,
  { clock = refreshClock }: { readonly clock?: RefreshClock } = {},
): Promise<Result<Resynced, RefreshFailure | ApiFailure>> {
  const fetched = await fetchForRefresh(externalId, clock);
  if (fetched.isErr()) return Result.err(fetched.error);
  const { page, picture } = fetched.value;
  return inUploadSlot(() => requestResync(externalId, picture ? { page, picture } : { page }));
}
