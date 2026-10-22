import type { ItemError, PortPicture, RunEvent } from "@myakiba/mfc/bridge";
import { readMfcEnvelope } from "@myakiba/mfc/page";
import type { MfcItemId, MfcOgImage } from "@myakiba/mfc/page";
import type { Clock, SessionValue } from "./clock";
import { PAGE_TIMEOUT_MS } from "./collect";
import type { CollectedPage, PageRequest } from "./collect";
import { TabTimeoutError, createMfcTabs } from "./mfc-tab";
import type { MfcTabLease, OwnedTab, TabsApi, WindowsApi } from "./mfc-tab";
import { toConfiguredUrl } from "./origins";
import type { Origins } from "./origins";
import { PICTURE_TIMEOUT_MS } from "./picture";
import { EMPTY_QUEUE, reduceQueue, sameJob, waitersOf } from "./queue";
import type { Job, Outcome, QueueAction, Requester, RunKey } from "./queue";
import { PauseTooLongError, THROTTLE, createThrottle, parseRetryAfter } from "./throttle";
import type { ThrottleState } from "./throttle";

export const CHALLENGE_WINDOW_MS = 120_000;
const CHALLENGE_POLL_MS = 500;
const RATE_LIMIT_STATUSES = new Set([429, 503]);

export type FetcherDeps = {
  readonly tabs: TabsApi;
  readonly windows: WindowsApi;
  readonly clock: Clock;
  readonly random: () => number;
  readonly origins: Origins;
  readonly throttleState: SessionValue<ThrottleState>;
  readonly ownedTab: SessionValue<OwnedTab>;
  readonly collectPage: (tabId: number, request: PageRequest) => Promise<CollectedPage>;
  /** Runs in the MFC tab, so the request carries the user's MFC cookies. */
  readonly fetchGatedPicture: (tabId: number, url: string) => Promise<PortPicture | null>;
  readonly fetchPublicPicture: (url: URL) => Promise<PortPicture | null>;
};

export type FetchRun = {
  readonly key: RunKey;
  readonly requester: Requester;
  readonly mfcItemIds: readonly MfcItemId[];
  readonly emit: (event: RunEvent<PortPicture>) => void;
};

type Attempt = Outcome | { readonly kind: "aborted" } | { readonly kind: "retry_owned" };

const ABORTED: Attempt = { kind: "aborted" };
const RETRY_OWNED: Attempt = { kind: "retry_owned" };

class TimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`MFC did not answer in ${timeoutMs} ms`);
    this.name = "TimeoutError";
  }
}

function failed(error: ItemError): Attempt {
  return { kind: "result", result: { ok: false, error } };
}

function failedIn(lease: MfcTabLease | null, error: "timeout" | "unexpected_page"): Attempt {
  return lease?.kind === "borrowed" ? RETRY_OWNED : failed(error);
}

export function createFetcher(deps: FetcherDeps) {
  const { clock, origins } = deps;
  const throttle = createThrottle({ clock, random: deps.random, state: deps.throttleState });
  const mfcTabs = createMfcTabs({ ...deps, owned: deps.ownedTab, throttle });
  const listeners = new Map<RunKey, FetchRun["emit"]>();
  let state = EMPTY_QUEUE;
  let current: { readonly job: Job; readonly controller: AbortController } | null = null;
  let draining: Promise<void> | null = null;

  function dispatch(action: QueueAction): void {
    const next = reduceQueue(state, action);
    state = next.state;
    for (const { run, event } of next.emit) {
      listeners.get(run)?.(event);
      if (event.type === "done") listeners.delete(run);
    }
    if (current && !sameJob(state.active, current.job)) current.controller.abort();
  }

  async function expire(
    timeoutMs: number,
    signal: AbortSignal,
    settled: AbortSignal,
  ): Promise<never> {
    await clock.sleep(timeoutMs, AbortSignal.any([signal, settled]));
    signal.throwIfAborted();
    throw new TimeoutError(timeoutMs);
  }

  async function withTimeout<T>(
    signal: AbortSignal,
    timeoutMs: number,
    work: () => Promise<T>,
  ): Promise<T> {
    signal.throwIfAborted();
    const settled = new AbortController();
    try {
      return await Promise.race([work(), expire(timeoutMs, signal, settled.signal)]);
    } finally {
      settled.abort();
    }
  }

  async function pictureOf(
    ogImage: MfcOgImage,
    tabId: number,
    signal: AbortSignal,
  ): Promise<PortPicture | null> {
    if (ogImage.kind !== "picture") return null;
    const { picture } = ogImage;
    const url = toConfiguredUrl(picture.url, origins);
    if (!url) return null;
    try {
      return await withTimeout(signal, PICTURE_TIMEOUT_MS, () =>
        picture.access === "gated"
          ? deps.fetchGatedPicture(tabId, picture.url)
          : deps.fetchPublicPicture(url),
      );
    } catch {
      return null;
    }
  }

  async function itemResult(
    page: CollectedPage,
    ogImage: MfcOgImage,
    tabId: number,
    signal: AbortSignal,
  ): Promise<Attempt> {
    return {
      kind: "result",
      result: { ok: true, html: page.html, picture: await pictureOf(ogImage, tabId, signal) },
    };
  }

  async function waitForItem(tabId: number, job: Job, deadline: number, signal: AbortSignal) {
    const request = { kind: "page", mode: "document", mfcItemId: job.mfcItemId } as const;
    while (clock.now() < deadline) {
      if (await mfcTabs.isShowing(tabId, job.mfcItemId)) {
        const page = await withTimeout(signal, deadline - clock.now(), () =>
          deps.collectPage(tabId, request),
        );
        const envelope = readMfcEnvelope(page);
        if (envelope.kind === "item" && envelope.mfcItemId === job.mfcItemId) {
          return { page, ogImage: envelope.ogImage };
        }
      }
      await clock.sleep(CHALLENGE_POLL_MS, signal);
      signal.throwIfAborted();
    }
    return null;
  }

  async function solveChallenge(
    job: Job,
    requester: Requester,
    signal: AbortSignal,
  ): Promise<Attempt> {
    const deadline = clock.now() + CHALLENGE_WINDOW_MS;
    let tabId: number;
    try {
      tabId = await mfcTabs.showChallenge(requester, job.mfcItemId, deadline, signal);
    } catch {
      return signal.aborted ? ABORTED : failed("challenge_unsolved");
    }
    dispatch({ type: "needs_user", untilMs: deadline });
    const solved = await waitForItem(tabId, job, deadline, signal).catch(() => null);
    await mfcTabs.handBack(requester, signal);
    if (signal.aborted) return ABORTED;
    if (!solved) return failed("challenge_unsolved");
    return itemResult(solved.page, solved.ogImage, tabId, signal);
  }

  async function attempt(job: Job, signal: AbortSignal): Promise<Attempt> {
    const requester = waitersOf(state, job)[0]?.requester;
    if (!requester) return ABORTED;
    let lease: MfcTabLease | null = null;
    try {
      lease = await mfcTabs.lease(requester, clock.now() + PAGE_TIMEOUT_MS, signal);
      const { tabId } = lease;
      const page = await throttle.load(signal, () =>
        withTimeout(signal, PAGE_TIMEOUT_MS, () =>
          deps.collectPage(tabId, { kind: "page", mode: "fetch", mfcItemId: job.mfcItemId }),
        ),
      );
      const envelope = readMfcEnvelope(page);
      switch (envelope.kind) {
        case "item":
          return envelope.mfcItemId === job.mfcItemId
            ? await itemResult(page, envelope.ogImage, tabId, signal)
            : failedIn(lease, "unexpected_page");
        case "challenge":
          return await solveChallenge(job, requester, signal);
        case "not_found":
          return failed(envelope.signedIn ? "hidden_or_missing" : "mfc_signed_out");
        case "unexpected": {
          if (!RATE_LIMIT_STATUSES.has(envelope.status)) return failedIn(lease, "unexpected_page");
          const now = clock.now();
          const pauseMs = parseRetryAfter(page.retryAfter, now) ?? THROTTLE.defaultPauseMs;
          return { kind: "rate_limited", pausedUntil: now + pauseMs };
        }
      }
    } catch (error) {
      if (signal.aborted) return ABORTED;
      if (error instanceof PauseTooLongError) {
        return { kind: "rate_limited", pausedUntil: error.pausedUntil };
      }
      const timedOut = error instanceof TimeoutError || error instanceof TabTimeoutError;
      return failedIn(lease, timedOut ? "timeout" : "unexpected_page");
    }
  }

  async function drain(): Promise<void> {
    for (;;) {
      dispatch({ type: "started" });
      const job = state.active;
      if (!job) break;
      const controller = new AbortController();
      current = { job, controller };
      const result = await attempt(job, controller.signal);
      current = null;
      if (result.kind === "retry_owned") mfcTabs.stopBorrowing();
      if (result.kind === "result" || result.kind === "rate_limited") {
        dispatch({ type: "answered", job, outcome: result, at: clock.now() });
      }
      if (result.kind === "rate_limited") {
        const { mode } = state;
        await throttle.pause(mode.kind === "halted" ? mode.until : result.pausedUntil);
      }
    }
    await mfcTabs.release();
  }

  function kick(): void {
    draining ??= (async () => {
      try {
        await drain();
      } catch (error) {
        console.error("the MFC fetch queue stopped", error);
      } finally {
        draining = null;
      }
      if (state.pending.length > 0) kick();
    })();
  }

  return {
    submit(run: FetchRun): void {
      listeners.set(run.key, run.emit);
      dispatch({
        type: "submitted",
        run: run.key,
        requester: run.requester,
        mfcItemIds: run.mfcItemIds,
        at: clock.now(),
      });
      kick();
    },
    cancel(key: RunKey): void {
      dispatch({ type: "cancelled", run: key });
    },
    noteTabActivated: (tabId: number) => mfcTabs.noteActivated(tabId),
    /** Runs the queue once, which closes a tab left open by a worker that stopped mid-run. */
    resume: kick,
  };
}

export type Fetcher = ReturnType<typeof createFetcher>;
