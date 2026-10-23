import { mfcItemId } from "@myakiba/mfc/page";
import type { MfcItemId } from "@myakiba/mfc/page";
import { toast } from "@/components/ui/toast";
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

type RunTally = {
  unanswered: number;
  busy: Extract<ServerAnswer, { readonly kind: "busy" }> | null;
};

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
  readonly heartbeat: () => Promise<ServerAnswer>;
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
    heartbeat: () => answerOf(session.heartbeat.post({ jobId })),
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
    heartbeat: () => answerOf(current.heartbeat.post({ jobId })),
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

type PageEvents = {
  readonly addEventListener: (type: "pagehide", listener: () => void) => void;
  readonly removeEventListener: (type: "pagehide", listener: () => void) => void;
};

type RunnerDeps = {
  readonly bridge: ExtensionBridge;
  readonly page: PageEvents;
  readonly heartbeatMs: number;
  readonly onBusy: (notImported: number, retryAfterMs: number | null) => void;
};

export function createExtensionRunner({ bridge, page, heartbeatMs, onBusy }: RunnerDeps) {
  return async function runWithExtension(run: ExtensionRun): Promise<void> {
    const ids = [...new Set(run.mfcItemIds.map(mfcItemId).filter((id) => id !== null))];
    if (ids.length === 0) return;
    const controller = new AbortController();
    const prompt = (next: ExtensionPrompt | null) =>
      setExtensionPrompt(run.runId, next && { sessionId: run.sessionId, prompt: next });
    const heartbeat = setInterval(() => {
      void run.heartbeat();
    }, heartbeatMs);
    const leave = () => {
      void run.interrupt({ keepalive: true });
    };
    page.addEventListener("pagehide", leave);

    const tally: RunTally = { unanswered: 0, busy: null };
    const uploads = new Map<MfcItemId, Promise<void>>();
    const send = (item: ItemPage) => {
      const sending = async () => {
        const answer = await completeOnce(run, item);
        uploads.delete(item.mfcItemId);
        if (answer.kind === "ok") return;
        tally.unanswered += 1;
        if (answer.kind === "busy") {
          tally.busy = answer;
          controller.abort();
        }
      };
      uploads.set(item.mfcItemId, sending());
    };

    try {
      for await (const event of bridge.fetchItems(ids, { signal: controller.signal })) {
        if (event.type === "status") {
          prompt(promptFor(event));
          continue;
        }
        prompt(null);
        const { result } = event;
        if (!result.ok) {
          const answer =
            result.error === "extension_stopped"
              ? FAILED
              : await run.fail(event.mfcItemId, result.error);
          if (answer.kind !== "ok") tally.unanswered += 1;
        } else if (tally.busy === null) {
          while (uploads.size >= MAX_UPLOADS_IN_FLIGHT) await Promise.race(uploads.values());
          send(itemPage(event.mfcItemId, result.html, result.picture));
        } else {
          tally.unanswered += 1;
        }
      }
      await Promise.all(uploads.values());
      if (tally.unanswered > 0) await run.interrupt({ keepalive: false });
      if (tally.busy !== null) onBusy(tally.unanswered, tally.busy.retryAfterMs);
    } catch {
      await run.interrupt({ keepalive: false });
    } finally {
      clearInterval(heartbeat);
      page.removeEventListener("pagehide", leave);
      prompt(null);
    }
  };
}

function showBusy(notImported: number, retryAfterMs: number | null): void {
  const minutes = retryAfterMs === null ? null : Math.max(1, Math.ceil(retryAfterMs / 60_000));
  toast.add({
    type: "error",
    title: "myakiba is busy",
    description: `${notImported} item${notImported === 1 ? " was" : "s were"} not imported. ${
      minutes === null ? "Retry them later." : `Retry them in about ${minutes} min.`
    }`,
  });
}

const runWithExtension = createExtensionRunner({
  bridge: extensionBridge,
  page: window,
  heartbeatMs: HEARTBEAT_MS,
  onBusy: showBusy,
});

async function startRun(run: ExtensionRun): Promise<void> {
  try {
    await runWithExtension(run);
  } catch (error) {
    reportError(error);
  }
}

export function importSyncItems(run: Parameters<typeof syncRun>[0]): void {
  void startRun(syncRun(run));
}

export function importDataTransferItems(run: Parameters<typeof importRun>[0]): void {
  void startRun(importRun(run));
}

export type ItemRefresh =
  | { readonly kind: "refreshed" | "unchanged"; readonly cooldownExpiresAt: string | null }
  | { readonly kind: "failed"; readonly message: string };

export async function refreshItemWithExtension(externalId: number): Promise<ItemRefresh> {
  const id = mfcItemId(externalId);
  if (id === null) return { kind: "failed", message: "Item not found" };
  const runId = `resync:${id}`;
  let fetched: ItemPage | null = null;
  let fetchError: FetchError = "extension_stopped";
  for await (const event of extensionBridge.fetchItems([id], {
    signal: new AbortController().signal,
  })) {
    if (event.type === "status") {
      const next = promptFor(event);
      setExtensionPrompt(runId, next && { sessionId: null, prompt: next });
    } else if (event.result.ok) {
      fetched = itemPage(id, event.result.html, event.result.picture);
    } else {
      fetchError = event.result.error;
    }
  }
  setExtensionPrompt(runId, null);
  if (fetched === null) return { kind: "failed", message: ITEM_ERROR_MESSAGE[fetchError] };

  const { page, picture } = fetched;
  try {
    const refreshed = await requestResync(externalId, picture ? { page, picture } : { page });
    return { kind: refreshed.saved, cooldownExpiresAt: refreshed.cooldownExpiresAt };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to request item refresh";
    return { kind: "failed", message };
  }
}
