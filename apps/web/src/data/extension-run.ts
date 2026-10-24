import { MAX_ITEM_FAILURES_PER_REPORT } from "@myakiba/contracts/mfc-items/schema";
import { mfcItemId } from "@myakiba/mfc/page";
import type { MfcItemId } from "@myakiba/mfc/page";
import { Result } from "better-result";
import { ExtensionStopped } from "@/lib/errors/extension-stopped";
import { InvalidMfcItemId } from "@/lib/errors/invalid-mfc-item-id";
import type { MfcItemFetchFailed } from "@/lib/errors/mfc-item-fetch-failed";
import { RunClosed } from "@/lib/errors/run-closed";
import { RunRateLimited } from "@/lib/errors/run-rate-limited";
import { RunUploadFailed } from "@/lib/errors/run-upload-failed";
import { extensionBridge } from "@/lib/extension-bridge";
import type {
  ExtensionBridge,
  ExtensionFetchEvent,
  ItemFetchFailure,
} from "@/lib/extension-bridge";
import { setExtensionPrompt } from "@/lib/extension-prompt";
import type { ExtensionPrompt } from "@/lib/extension-prompt";
import { app } from "@/lib/treaty-client";
import { requestResync } from "@/queries/item";

const HEARTBEAT_MS = 20_000;
const FAILURE_FLUSH_MS = 1000;
const QUEUED_PROMPT_DELAY_MS = 1000;
const MAX_UPLOADS_IN_FLIGHT = 2;
const MAX_RETRY_AFTER_MS = 60_000;
// A page may have at most 64 KiB of keepalive request bodies in flight.
const KEEPALIVE_BODY_BYTES = 64 * 1024;

type StatusEvent = Extract<ExtensionFetchEvent, { readonly type: "status" }>;
type ItemError = MfcItemFetchFailed["code"];

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
} as const satisfies Record<ItemError | "extension_stopped", string>;

type ServerFailure = RunUploadFailed | RunRateLimited | RunClosed;

type ServerAnswer = Result<void, ServerFailure>;

type EdenAnswer<Data> =
  | { readonly data: Data; readonly error: null; readonly response?: Response }
  | {
      readonly data: null;
      readonly error: { readonly status: number };
      readonly response?: Response;
    };

const RUN_CLOSED_STATUSES: ReadonlySet<number> = new Set([401, 403, 404]);

async function answerOf<Data>(
  sending: Promise<EdenAnswer<Data>>,
  read: (data: Data) => ServerAnswer = () => Result.ok(),
): Promise<ServerAnswer> {
  let answer: EdenAnswer<Data>;
  try {
    answer = await sending;
  } catch (error) {
    // Eden rejects when the connection drops after the headers, a request that failed like any other.
    return Result.err(new RunUploadFailed({ status: null, cause: error }));
  }
  if (answer.error === null) return read(answer.data);
  const { status } = answer.error;
  if (RUN_CLOSED_STATUSES.has(status)) return Result.err(new RunClosed({ status }));
  if (status !== 429) return Result.err(new RunUploadFailed({ status, cause: answer.error }));
  const seconds = Number(answer.response?.headers.get("retry-after") ?? Number.NaN);
  return Result.err(new RunRateLimited({ retryAfterMs: seconds >= 0 ? seconds * 1000 : null }));
}

const notSaved = () => Result.err(new RunUploadFailed({ status: null }));
const ended = () => Result.err(new RunClosed({ status: null }));

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

type Delivery = { readonly keepalive: boolean };

type RunBody = { readonly jobId: string };
type FailureBody = RunBody & { readonly failures: ItemFailure[] };

const runBody = (jobId: string): RunBody => ({ jobId });

const failureBody = (jobId: string, failures: readonly ItemFailure[]): FailureBody => ({
  jobId,
  failures: [...failures],
});

type ExtensionRun = {
  readonly jobId: string;
  readonly sessionId: string | null;
  readonly mfcItemIds: readonly number[];
  readonly complete: (item: ItemPage) => Promise<ServerAnswer>;
  readonly report: (failures: readonly ItemFailure[], delivery: Delivery) => Promise<ServerAnswer>;
  readonly heartbeat: () => Promise<ServerAnswer>;
  readonly interrupt: (delivery: Delivery) => Promise<ServerAnswer>;
};

export function syncRun(run: {
  readonly sessionId: string;
  readonly jobId: string;
  readonly mfcItemIds: readonly number[];
}): ExtensionRun {
  const { sessionId, jobId } = run;
  const session = app.api.sync.sessions({ id: sessionId });
  return {
    jobId,
    sessionId,
    mfcItemIds: run.mfcItemIds,
    complete: (item) =>
      answerOf(session.items.post({ jobId, ...item }), (data) =>
        data.outcome === "failed" ? notSaved() : Result.ok(),
      ),
    report: (failures, { keepalive }) =>
      answerOf(session.failures.post(failureBody(jobId, failures), { fetch: { keepalive } })),
    heartbeat: () =>
      answerOf(session.heartbeat.post(runBody(jobId)), (data) =>
        data.active ? Result.ok() : ended(),
      ),
    interrupt: ({ keepalive }) =>
      answerOf(session.interrupt.post(runBody(jobId), { fetch: { keepalive } })),
  };
}

export function importRun(run: {
  readonly importId: string;
  readonly mfcItemIds: readonly number[];
}): ExtensionRun {
  const jobId = run.importId;
  const current = app.api["data-transfer"].imports.current;
  return {
    jobId,
    sessionId: null,
    mfcItemIds: run.mfcItemIds,
    complete: (item) => answerOf(current.items.post({ jobId, ...item })),
    report: (failures, { keepalive }) =>
      answerOf(current.items.failure.post(failureBody(jobId, failures), { fetch: { keepalive } })),
    heartbeat: () =>
      answerOf(current.heartbeat.post(runBody(jobId)), (data) =>
        data.running ? Result.ok() : ended(),
      ),
    interrupt: ({ keepalive }) =>
      answerOf(current.interrupt.post(runBody(jobId), { fetch: { keepalive } })),
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

type FetchedPage = {
  readonly mfcItemId: MfcItemId;
  readonly page: Result<ItemPage, ItemFetchFailure>;
};

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
      yield { mfcItemId: id, page: result.map(({ html, picture }) => itemPage(id, html, picture)) };
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
  if (answer.isOk() || !RunRateLimited.is(answer.error)) return answer;
  const { retryAfterMs } = answer.error;
  if (retryAfterMs === null || retryAfterMs > MAX_RETRY_AFTER_MS) return answer;
  await waitUnlessAborted(retryAfterMs, signal);
  return signal.aborted ? Result.err(new RunUploadFailed({ status: null })) : run.complete(item);
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

const tabUploadSlots = uploadSlots(MAX_UPLOADS_IN_FLIGHT);

let pageKeepaliveBytes = 0;

const jsonBytes = (body: RunBody | FailureBody | ItemFailure) =>
  new TextEncoder().encode(JSON.stringify(body)).byteLength;

async function sendKeepalive(bytes: number, send: () => Promise<ServerAnswer>): Promise<void> {
  pageKeepaliveBytes += bytes;
  await send();
  pageKeepaliveBytes -= bytes;
}

function leadingFailuresWithin(
  maxBytes: number,
  jobId: string,
  failures: readonly ItemFailure[],
): readonly ItemFailure[] {
  let bytes = jsonBytes(failureBody(jobId, []));
  let fit = 0;
  for (const failure of failures) {
    bytes += jsonBytes(failure) + (fit > 0 ? 1 : 0);
    if (bytes > maxBytes) break;
    fit += 1;
  }
  return failures.slice(0, fit);
}

export type RunOutcome =
  | { readonly kind: "ended" }
  | { readonly kind: "busy"; readonly notImported: number; readonly retryAfterMs: number | null };

const ENDED: RunOutcome = { kind: "ended" };

type Stop =
  | { readonly kind: "busy"; readonly retryAfterMs: number | null }
  | { readonly kind: "over" }
  | { readonly kind: "left" };

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

  return async function runWithExtension(run: ExtensionRun): Promise<RunOutcome> {
    const ids = [...new Set(run.mfcItemIds.map(mfcItemId).filter((id) => id !== null))];
    if (ids.length === 0) return ENDED;
    const controller = new AbortController();
    const tally: RunTally = { imported: 0, unanswered: 0, stop: null };
    const halt = (stop: Stop) => {
      tally.stop ??= stop;
      controller.abort();
    };
    const refused = (failure: ServerFailure, items: number) => {
      tally.unanswered += items;
      failure.match({
        RunRateLimited: ({ retryAfterMs }) => halt({ kind: "busy", retryAfterMs }),
        RunClosed: () => halt({ kind: "over" }),
        RunUploadFailed: () => {},
      });
    };
    const renew = async () => {
      const answer = await run.heartbeat();
      if (answer.isErr() && RunClosed.is(answer.error)) halt({ kind: "over" });
    };
    const heartbeat = setInterval(() => {
      void renew();
    }, heartbeatMs);

    const reports: Promise<void>[] = [];
    const report = async (batch: readonly ItemFailure[]) => {
      const answer = await run.report(batch, { keepalive: false });
      if (answer.isErr()) refused(answer.error, batch.length);
    };
    let failures: ItemFailure[] = [];
    let flushTimer: ReturnType<typeof setTimeout> | undefined;
    const takeFailures = () => {
      clearTimeout(flushTimer);
      flushTimer = undefined;
      const batch = failures;
      failures = [];
      return batch;
    };
    const flush = () => {
      const batch = takeFailures();
      if (batch.length > 0 && !serverHoldsEnd(tally.stop)) reports.push(report(batch));
    };
    const fail = (failure: ItemFailure) => {
      failures.push(failure);
      if (failures.length >= MAX_ITEM_FAILURES_PER_REPORT) flush();
      else flushTimer ??= setTimeout(flush, failureFlushMs);
    };

    // A page restored from the back-forward cache must not drive a run the server has since settled.
    const leave = () => {
      const interruptBytes = jsonBytes(runBody(run.jobId));
      const room = KEEPALIVE_BODY_BYTES - pageKeepaliveBytes - interruptBytes;
      const sent = leadingFailuresWithin(room, run.jobId, takeFailures());
      if (sent.length > 0) {
        const reportBytes = jsonBytes(failureBody(run.jobId, sent));
        void sendKeepalive(reportBytes, () => run.report(sent, { keepalive: true }));
      }
      void sendKeepalive(interruptBytes, () => run.interrupt({ keepalive: true }));
      halt({ kind: "left" });
    };
    page.addEventListener("pagehide", leave);

    const uploads: Promise<void>[] = [];
    const takeSlotUnlessStopped = async () => {
      if (tally.stop !== null) return false;
      await tabUploadSlots.take();
      if (tally.stop === null) return true;
      tabUploadSlots.give();
      return false;
    };
    const upload = async (item: ItemPage) => {
      try {
        const answer = await completeOnce(run, item, controller.signal);
        if (answer.isOk()) tally.imported += 1;
        else refused(answer.error, 1);
      } finally {
        tabUploadSlots.give();
      }
    };

    const target = { runId: run.jobId, sessionId: run.sessionId };
    try {
      for await (const { mfcItemId: id, page: fetched } of fetchPagesShowingPrompts(
        deps,
        target,
        ids,
        controller.signal,
      )) {
        if (fetched.isErr()) {
          fetched.error.match({
            ExtensionStopped: () => {
              tally.unanswered += 1;
            },
            MfcItemFetchFailed: ({ code }) => fail({ mfcItemId: id, error: code }),
          });
        } else if (await takeSlotUnlessStopped()) {
          uploads.push(upload(fetched.value));
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

type RefreshFailure = InvalidMfcItemId | ItemFetchFailure;

function refreshFailureText(failure: RefreshFailure): string {
  return failure.match({
    InvalidMfcItemId: () => "Item not found",
    ExtensionStopped: () => ITEM_ERROR_MESSAGE.extension_stopped,
    MfcItemFetchFailed: ({ code }) => ITEM_ERROR_MESSAGE[code],
  });
}

async function fetchForRefresh(externalId: number): Promise<Result<ItemPage, RefreshFailure>> {
  const id = mfcItemId(externalId);
  if (id === null) return Result.err(new InvalidMfcItemId({ externalId }));
  let fetched: Result<ItemPage, ItemFetchFailure> = Result.err(new ExtensionStopped());
  const target = { runId: `resync:${id}`, sessionId: null };
  for await (const { page } of fetchPagesShowingPrompts(
    fetchDeps,
    target,
    [id],
    new AbortController().signal,
  )) {
    fetched = page;
  }
  return fetched;
}

export async function refreshItemWithExtension(externalId: number) {
  const fetched = await fetchForRefresh(externalId);
  // The seam with useResourceMutation, which reads a failed refresh from the message it throws.
  if (fetched.isErr()) throw new Error(refreshFailureText(fetched.error));
  const { page, picture } = fetched.value;
  await tabUploadSlots.take();
  try {
    return await requestResync(externalId, picture ? { page, picture } : { page });
  } finally {
    tabUploadSlots.give();
  }
}
