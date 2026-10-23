import { mfcItemId } from "@myakiba/mfc/page";
import type { MfcItemId } from "@myakiba/mfc/page";
import { extensionBridge } from "@/lib/extension-bridge";
import type { ExtensionBridge, ExtensionFetchEvent } from "@/lib/extension-bridge";
import { setExtensionPrompt } from "@/lib/extension-prompt";
import type { ExtensionPrompt } from "@/lib/extension-prompt";
import { app } from "@/lib/treaty-client";
import { requestResync } from "@/queries/item";

const HEARTBEAT_MS = 20_000;
const MAX_UPLOADS_IN_FLIGHT = 2;
const MAX_RETRY_AFTER_MS = 60_000;

type ItemEvent = Extract<ExtensionFetchEvent, { readonly type: "item" }>;
type StatusEvent = Extract<ExtensionFetchEvent, { readonly type: "status" }>;
type FetchError = Extract<ItemEvent["result"], { readonly ok: false }>["error"];
type ItemError = Exclude<FetchError, "extension_stopped">;

const ITEM_ERROR_MESSAGE = {
  mfc_signed_out: "Sign in to MyFigureCollection to import this item",
  hidden_or_missing:
    "MyFigureCollection hides this item. Check your MyFigureCollection content settings",
  challenge_unsolved: "The MyFigureCollection security check was not completed",
  rate_limited: "MyFigureCollection asked us to slow down. Try again later",
  timeout: "MyFigureCollection took too long to answer",
  unexpected_page: "MyFigureCollection showed an unexpected page",
  extension_stopped: "The extension stopped. Reload the page and try again",
  unknown: "The extension could not fetch this item",
} as const satisfies Record<FetchError, string>;

export type ServerAnswer =
  | { readonly kind: "ok" }
  | { readonly kind: "busy"; readonly retryAfterMs: number | null }
  | { readonly kind: "failed" };

type EdenAnswer = {
  readonly error: { readonly status: unknown } | null;
  readonly response?: Response | undefined;
};

/** Why a run stopped before the extension finished it. After `over` or `left` the server already holds its end. */
type Stop =
  | Extract<ServerAnswer, { readonly kind: "busy" }>
  | { readonly kind: "over" }
  | { readonly kind: "left" };

type RunTally = { unanswered: number; stop: Stop | null };

const OK: ServerAnswer = { kind: "ok" };
const FAILED: ServerAnswer = { kind: "failed" };

async function answerOf(request: Promise<EdenAnswer>): Promise<ServerAnswer> {
  try {
    const { error, response } = await request;
    if (error === null) return OK;
    if (error.status !== 429) return FAILED;
    const seconds = Number(response?.headers.get("retry-after") ?? Number.NaN);
    return { kind: "busy", retryAfterMs: seconds >= 0 ? seconds * 1000 : null };
  } catch {
    return FAILED;
  }
}

/** `over` once the server has ended the run, or a retry replaced it. */
type Lease = "held" | "over";

async function leaseOf<Data>(
  request: Promise<{ readonly data: Data | null }>,
  held: (data: Data) => boolean,
): Promise<Lease> {
  try {
    const { data } = await request;
    return data === null || held(data) ? "held" : "over";
  } catch {
    return "held";
  }
}

type ItemPage = { readonly mfcItemId: MfcItemId; readonly page: File; readonly picture?: File };

function itemPage(id: MfcItemId, html: string, picture: Blob | null): ItemPage {
  const page = new File([html], "page.html", { type: "text/html" });
  if (picture === null) return { mfcItemId: id, page };
  return {
    mfcItemId: id,
    page,
    picture: new File([picture], "picture", { type: picture.type }),
  };
}

export type ExtensionRun = {
  readonly runId: string;
  readonly sessionId: string | null;
  readonly mfcItemIds: readonly number[];
  readonly complete: (item: ItemPage) => Promise<ServerAnswer>;
  readonly fail: (mfcItemId: MfcItemId, error: ItemError) => Promise<ServerAnswer>;
  readonly heartbeat: () => Promise<Lease>;
  readonly interrupt: (options: { readonly keepalive: boolean }) => Promise<ServerAnswer>;
};

export function syncRun(run: {
  readonly sessionId: string;
  readonly jobId: string;
  readonly mfcItemIds: readonly number[];
}): ExtensionRun {
  const { sessionId, jobId } = run;
  const session = app.api.sync.sessions({ id: sessionId });
  return {
    runId: jobId,
    sessionId,
    mfcItemIds: run.mfcItemIds,
    complete: (item) => answerOf(session.items.post({ jobId, ...item })),
    fail: (id, error) => answerOf(session.failures.post({ jobId, mfcItemId: id, error })),
    heartbeat: () => leaseOf(session.heartbeat.post({ jobId }), (data) => data.active),
    interrupt: ({ keepalive }) =>
      answerOf(session.interrupt.post({ jobId }, { fetch: { keepalive } })),
  };
}

export function importRun(run: {
  readonly importId: string;
  readonly mfcItemIds: readonly number[];
}): ExtensionRun {
  const jobId = run.importId;
  const current = app.api["data-transfer"].imports.current;
  return {
    runId: jobId,
    sessionId: null,
    mfcItemIds: run.mfcItemIds,
    complete: (item) => answerOf(current.items.post({ jobId, ...item })),
    fail: (id, error) =>
      answerOf(
        current.items.failure.post({ jobId, mfcItemId: id, reason: ITEM_ERROR_MESSAGE[error] }),
      ),
    heartbeat: () => leaseOf(current.heartbeat.post({ jobId }), (data) => data.running),
    interrupt: ({ keepalive }) =>
      answerOf(current.interrupt.post({ jobId }, { fetch: { keepalive } })),
  };
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

type FetchedPage =
  | { readonly mfcItemId: MfcItemId; readonly ok: true; readonly page: ItemPage }
  | { readonly mfcItemId: MfcItemId; readonly ok: false; readonly error: FetchError };

type PromptTarget = { readonly runId: string; readonly sessionId: string | null };

/**
 * Fetches the ids through the extension, and keeps the extension's prompt in the store until it ends.
 * @yields {FetchedPage} each item's page, or why the extension could not fetch it
 */
async function* fetchPages(
  bridge: ExtensionBridge,
  { runId, sessionId }: PromptTarget,
  ids: readonly MfcItemId[],
  signal: AbortSignal,
): AsyncGenerator<FetchedPage> {
  const show = (prompt: ExtensionPrompt | null) =>
    setExtensionPrompt(runId, prompt && { sessionId, prompt });
  try {
    for await (const event of bridge.fetchItems(ids, { signal })) {
      if (event.type === "status") {
        show(promptFor(event));
        continue;
      }
      show(null);
      const { mfcItemId: id, result } = event;
      yield result.ok
        ? { mfcItemId: id, ok: true, page: itemPage(id, result.html, result.picture) }
        : { mfcItemId: id, ok: false, error: result.error };
    }
  } finally {
    show(null);
  }
}

async function completeOnce(run: ExtensionRun, item: ItemPage): Promise<ServerAnswer> {
  const answer = await run.complete(item);
  if (answer.kind !== "busy" || answer.retryAfterMs === null) return answer;
  const waitMs = answer.retryAfterMs;
  if (waitMs > MAX_RETRY_AFTER_MS) return answer;
  await new Promise((resolve) => {
    setTimeout(resolve, waitMs);
  });
  return run.complete(item);
}

/** How a run ended. `busy` means the server refused it for now, so some items were not imported. */
export type RunOutcome =
  | { readonly kind: "ended" }
  | { readonly kind: "busy"; readonly notImported: number; readonly retryAfterMs: number | null };

const ENDED: RunOutcome = { kind: "ended" };

type PageEvents = {
  readonly addEventListener: (type: "pagehide", listener: () => void) => void;
  readonly removeEventListener: (type: "pagehide", listener: () => void) => void;
};

type RunnerDeps = {
  readonly bridge: ExtensionBridge;
  readonly page: PageEvents;
  readonly heartbeatMs: number;
};

/** The returned function never rejects. */
export function createExtensionRunner({ bridge, page, heartbeatMs }: RunnerDeps) {
  return async function runWithExtension(run: ExtensionRun): Promise<RunOutcome> {
    const ids = [...new Set(run.mfcItemIds.map(mfcItemId).filter((id) => id !== null))];
    if (ids.length === 0) return ENDED;
    const controller = new AbortController();
    const tally: RunTally = { unanswered: 0, stop: null };
    const halt = (stop: Stop) => {
      tally.stop ??= stop;
      controller.abort();
    };
    const renew = async () => {
      if ((await run.heartbeat()) === "over") halt({ kind: "over" });
    };
    const heartbeat = setInterval(() => {
      void renew();
    }, heartbeatMs);
    // A page restored from the back-forward cache must not drive a run the server has since settled.
    const leave = () => {
      void run.interrupt({ keepalive: true });
      halt({ kind: "left" });
    };
    page.addEventListener("pagehide", leave);

    const uploads = new Map<MfcItemId, Promise<void>>();
    const send = (item: ItemPage) => {
      const sending = async () => {
        const answer = await completeOnce(run, item);
        uploads.delete(item.mfcItemId);
        if (answer.kind === "ok") return;
        tally.unanswered += 1;
        if (answer.kind === "busy") halt(answer);
      };
      uploads.set(item.mfcItemId, sending());
    };

    try {
      for await (const fetched of fetchPages(bridge, run, ids, controller.signal)) {
        if (!fetched.ok) {
          const answer =
            fetched.error === "extension_stopped"
              ? FAILED
              : await run.fail(fetched.mfcItemId, fetched.error);
          if (answer.kind !== "ok") tally.unanswered += 1;
        } else if (tally.stop === null) {
          while (uploads.size >= MAX_UPLOADS_IN_FLIGHT) await Promise.race(uploads.values());
          send(fetched.page);
        } else {
          tally.unanswered += 1;
        }
      }
      await Promise.all(uploads.values());
      const ended = tally.stop?.kind === "over" || tally.stop?.kind === "left";
      if (tally.unanswered > 0 && !ended) await run.interrupt({ keepalive: false });
    } finally {
      clearInterval(heartbeat);
      page.removeEventListener("pagehide", leave);
    }
    const { stop } = tally;
    return stop?.kind === "busy"
      ? { kind: "busy", notImported: tally.unanswered, retryAfterMs: stop.retryAfterMs }
      : ENDED;
  };
}

const runWithExtension = createExtensionRunner({
  bridge: extensionBridge,
  page: window,
  heartbeatMs: HEARTBEAT_MS,
});

export function importSyncItems(run: Parameters<typeof syncRun>[0]): Promise<RunOutcome> {
  return runWithExtension(syncRun(run));
}

export function importDataTransferItems(run: Parameters<typeof importRun>[0]): Promise<RunOutcome> {
  return runWithExtension(importRun(run));
}

/** Fetches the item's page through the extension and posts it as its Item Refresh. Rejects with why it could not. */
export async function refreshItemWithExtension(externalId: number) {
  const id = mfcItemId(externalId);
  if (id === null) throw new Error("Item not found");
  let fetched: FetchedPage | undefined;
  const target = { runId: `resync:${id}`, sessionId: null };
  for await (const page of fetchPages(
    extensionBridge,
    target,
    [id],
    new AbortController().signal,
  )) {
    fetched = page;
  }
  if (fetched === undefined) throw new Error(ITEM_ERROR_MESSAGE.extension_stopped);
  if (!fetched.ok) throw new Error(ITEM_ERROR_MESSAGE[fetched.error]);
  const { page, picture } = fetched.page;
  return requestResync(externalId, picture ? { page, picture } : { page });
}
