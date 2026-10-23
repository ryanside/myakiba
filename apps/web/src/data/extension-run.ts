import { MAX_ITEM_FAILURES_PER_REPORT } from "@myakiba/contracts/mfc-items/schema";
import { mfcItemId } from "@myakiba/mfc/page";
import type { MfcItemId } from "@myakiba/mfc/page";
import { extensionBridge } from "@/lib/extension-bridge";
import type { ExtensionBridge, ExtensionFetchEvent } from "@/lib/extension-bridge";
import { setExtensionPrompt } from "@/lib/extension-prompt";
import type { ExtensionPrompt } from "@/lib/extension-prompt";
import { app } from "@/lib/treaty-client";
import { requestResync } from "@/queries/item";

const HEARTBEAT_MS = 20_000;
const FAILURE_FLUSH_MS = 1000;
const QUEUED_PROMPT_DELAY_MS = 1000;
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

type Busy = { readonly kind: "busy"; readonly retryAfterMs: number | null };
type Over = { readonly kind: "over" };

type ServerAnswer = { readonly kind: "ok" } | { readonly kind: "failed" } | Busy | Over;

type EdenAnswer<Data> =
  | { readonly data: Data; readonly error: null; readonly response?: Response }
  | {
      readonly data: null;
      readonly error: { readonly status: unknown };
      readonly response?: Response;
    };

const OK: ServerAnswer = { kind: "ok" };
const FAILED: ServerAnswer = { kind: "failed" };
const OVER: Over = { kind: "over" };

const RUN_CLOSED_STATUSES: ReadonlySet<unknown> = new Set([401, 403, 404]);

async function answerOf<Data>(
  sending: Promise<EdenAnswer<Data>>,
  read: (data: Data) => ServerAnswer = () => OK,
): Promise<ServerAnswer> {
  let answer: EdenAnswer<Data>;
  try {
    answer = await sending;
  } catch {
    // Eden rejects when the connection drops after the headers, a request that failed like any other.
    return FAILED;
  }
  if (answer.error === null) return read(answer.data);
  const { status } = answer.error;
  if (RUN_CLOSED_STATUSES.has(status)) return OVER;
  if (status !== 429) return FAILED;
  const seconds = Number(answer.response?.headers.get("retry-after") ?? Number.NaN);
  return { kind: "busy", retryAfterMs: seconds >= 0 ? seconds * 1000 : null };
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

type ItemFailure = { readonly mfcItemId: MfcItemId; readonly error: ItemError };

type ExtensionRun = {
  readonly runId: string;
  readonly sessionId: string | null;
  readonly mfcItemIds: readonly number[];
  readonly complete: (item: ItemPage) => Promise<ServerAnswer>;
  readonly report: (failures: readonly ItemFailure[]) => Promise<ServerAnswer>;
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
    complete: (item) =>
      answerOf(session.items.post({ jobId, ...item }), (data) =>
        data.outcome === "failed" ? FAILED : OK,
      ),
    report: (failures) => answerOf(session.failures.post({ jobId, failures: [...failures] })),
    heartbeat: () =>
      answerOf(session.heartbeat.post({ jobId }), (data) => (data.active ? OK : OVER)),
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
    report: (failures) => answerOf(current.items.failure.post({ jobId, failures: [...failures] })),
    heartbeat: () =>
      answerOf(current.heartbeat.post({ jobId }), (data) => (data.running ? OK : OVER)),
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

type FetchDeps = { readonly bridge: ExtensionBridge; readonly queuedPromptDelayMs: number };

async function* fetchPagesShowingPrompts(
  { bridge, queuedPromptDelayMs }: FetchDeps,
  { runId, sessionId }: PromptTarget,
  ids: readonly MfcItemId[],
  signal: AbortSignal,
): AsyncGenerator<FetchedPage> {
  let queuedPromptTimer: ReturnType<typeof setTimeout> | undefined;
  const show = (prompt: ExtensionPrompt | null) => {
    clearTimeout(queuedPromptTimer);
    if (prompt?.kind === "queued") {
      setExtensionPrompt(runId, null);
      queuedPromptTimer = setTimeout(
        () => setExtensionPrompt(runId, { sessionId, prompt }),
        queuedPromptDelayMs,
      );
    } else {
      setExtensionPrompt(runId, prompt && { sessionId, prompt });
    }
  };
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

async function waitUnlessAborted(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return;
  await new Promise<void>((resolve) => {
    const stop = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", stop);
      resolve();
    };
    const timer = setTimeout(stop, ms);
    signal.addEventListener("abort", stop, { once: true });
  });
}

async function completeOnce(
  run: ExtensionRun,
  item: ItemPage,
  signal: AbortSignal,
): Promise<ServerAnswer> {
  const answer = await run.complete(item);
  if (answer.kind !== "busy" || answer.retryAfterMs === null) return answer;
  if (answer.retryAfterMs > MAX_RETRY_AFTER_MS) return answer;
  await waitUnlessAborted(answer.retryAfterMs, signal);
  return signal.aborted ? FAILED : run.complete(item);
}

function uploadSlots(size: number) {
  let free = size;
  const waiting: (() => void)[] = [];
  return {
    take: async (): Promise<void> => {
      if (free > 0) {
        free -= 1;
        return;
      }
      await new Promise<void>((resolve) => {
        waiting.push(resolve);
      });
    },
    give: (): void => {
      const wake = waiting.shift();
      if (wake === undefined) free += 1;
      else wake();
    },
  };
}

export type RunOutcome =
  | { readonly kind: "ended" }
  | { readonly kind: "busy"; readonly notImported: number; readonly retryAfterMs: number | null };

const ENDED: RunOutcome = { kind: "ended" };

type Stop = Busy | Over | { readonly kind: "left" };

const serverHoldsEnd = (stop: Stop | null) => stop?.kind === "over" || stop?.kind === "left";

type RunTally = { imported: number; unanswered: number; stop: Stop | null };

type PageEvents = {
  readonly addEventListener: (type: "pagehide", listener: () => void) => void;
  readonly removeEventListener: (type: "pagehide", listener: () => void) => void;
};

type RunnerDeps = FetchDeps & {
  readonly page: PageEvents;
  readonly heartbeatMs: number;
  readonly failureFlushMs: number;
};

export function createExtensionRunner(deps: RunnerDeps) {
  const { page, heartbeatMs, failureFlushMs } = deps;
  const slots = uploadSlots(MAX_UPLOADS_IN_FLIGHT);

  return async function runWithExtension(run: ExtensionRun): Promise<RunOutcome> {
    const ids = [...new Set(run.mfcItemIds.map(mfcItemId).filter((id) => id !== null))];
    if (ids.length === 0) return ENDED;
    const controller = new AbortController();
    const tally: RunTally = { imported: 0, unanswered: 0, stop: null };
    const halt = (stop: Stop) => {
      tally.stop ??= stop;
      controller.abort();
    };
    const refused = (answer: ServerAnswer, items: number) => {
      tally.unanswered += items;
      if (answer.kind === "busy" || answer.kind === "over") halt(answer);
    };
    const renew = async () => {
      const answer = await run.heartbeat();
      if (answer.kind === "over") halt(answer);
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

    const reports: Promise<void>[] = [];
    const report = async (batch: readonly ItemFailure[]) => {
      const answer = await run.report(batch);
      if (answer.kind !== "ok") refused(answer, batch.length);
    };
    let failures: ItemFailure[] = [];
    let flushTimer: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
      clearTimeout(flushTimer);
      flushTimer = undefined;
      const batch = failures;
      failures = [];
      if (batch.length > 0 && !serverHoldsEnd(tally.stop)) reports.push(report(batch));
    };
    const fail = (failure: ItemFailure) => {
      failures.push(failure);
      if (failures.length >= MAX_ITEM_FAILURES_PER_REPORT) flush();
      else flushTimer ??= setTimeout(flush, failureFlushMs);
    };

    const uploads: Promise<void>[] = [];
    const takeSlotUnlessStopped = async () => {
      if (tally.stop !== null) return false;
      await slots.take();
      if (tally.stop === null) return true;
      slots.give();
      return false;
    };
    const upload = async (item: ItemPage) => {
      try {
        const answer = await completeOnce(run, item, controller.signal);
        if (answer.kind === "ok") tally.imported += 1;
        else refused(answer, 1);
      } finally {
        slots.give();
      }
    };

    try {
      for await (const fetched of fetchPagesShowingPrompts(deps, run, ids, controller.signal)) {
        if (!fetched.ok) {
          if (fetched.error === "extension_stopped") tally.unanswered += 1;
          else fail({ mfcItemId: fetched.mfcItemId, error: fetched.error });
        } else if (await takeSlotUnlessStopped()) {
          uploads.push(upload(fetched.page));
        } else {
          tally.unanswered += 1;
        }
      }
      await Promise.all(uploads);
      flush();
      await Promise.all(reports);
      if (tally.unanswered > 0 && !serverHoldsEnd(tally.stop)) {
        await run.interrupt({ keepalive: false });
      }
    } finally {
      clearInterval(heartbeat);
      clearTimeout(flushTimer);
      page.removeEventListener("pagehide", leave);
    }
    const { stop } = tally;
    return stop?.kind === "busy"
      ? { kind: "busy", notImported: ids.length - tally.imported, retryAfterMs: stop.retryAfterMs }
      : ENDED;
  };
}

const fetchDeps: FetchDeps = {
  bridge: extensionBridge,
  queuedPromptDelayMs: QUEUED_PROMPT_DELAY_MS,
};

const runWithExtension = createExtensionRunner({
  ...fetchDeps,
  page: window,
  heartbeatMs: HEARTBEAT_MS,
  failureFlushMs: FAILURE_FLUSH_MS,
});

export function importSyncItems(run: Parameters<typeof syncRun>[0]): Promise<RunOutcome> {
  return runWithExtension(syncRun(run));
}

export function importDataTransferItems(run: Parameters<typeof importRun>[0]): Promise<RunOutcome> {
  return runWithExtension(importRun(run));
}

export async function refreshItemWithExtension(externalId: number) {
  const id = mfcItemId(externalId);
  if (id === null) throw new Error("Item not found");
  let fetched: FetchedPage | undefined;
  const target = { runId: `resync:${id}`, sessionId: null };
  for await (const page of fetchPagesShowingPrompts(
    fetchDeps,
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
