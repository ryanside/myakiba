import type { ItemError, PortPicture, RunEvent } from "@myakiba/mfc/bridge";
import { readMfcEnvelope } from "@myakiba/mfc/page";
import type { MfcItemId, MfcOgImage } from "@myakiba/mfc/page";
import { TimeoutError, timeoutSignal, unlessAborted, withTimeout } from "./clock";
import type { Clock, SessionValue } from "./clock";
import type { CollectedPage, PageRequest } from "./collect";
import { createMfcTabs } from "./mfc-tab";
import type { LiveRequester, MfcTabLease, OwnedTab, TabsApi, WindowsApi } from "./mfc-tab";
import { toConfiguredUrl } from "./origins";
import type { Origins } from "./origins";
import { PICTURE_TIMEOUT_MS } from "./picture";
import { EMPTY_QUEUE, reduceQueue, sameJob, waitersOf } from "./queue";
import type { Job, Outcome, QueueAction, Requester, RunKey } from "./queue";
import { PauseTooLongError, THROTTLE, createThrottle, parseRetryAfter } from "./throttle";
import type { ThrottleState } from "./throttle";

export const CHALLENGE_WINDOW_MS = 120_000;
const RATE_LIMIT_STATUSES = new Set([429, 503]);
/** Cloudflare serves its challenge with 403. A loaded page cannot read the header that marks it, nor rely on its localized title. */
const CHALLENGE_STATUS = 403;

export type FetcherDeps = {
  readonly tabs: TabsApi;
  readonly windows: WindowsApi;
  readonly clock: Clock;
  readonly random: () => number;
  readonly origins: Origins;
  readonly throttleState: SessionValue<ThrottleState>;
  readonly ownedTab: SessionValue<OwnedTab>;
  readonly collectPage: (
    tabId: number,
    request: PageRequest,
    signal: AbortSignal,
  ) => Promise<CollectedPage>;
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

type Reading =
  | { readonly kind: "item"; readonly ogImage: MfcOgImage }
  | { readonly kind: "challenge" }
  | Outcome;

type Answer = Exclude<Reading, { readonly kind: "challenge" }>;

function failed(error: ItemError): Outcome {
  return { kind: "result", result: { ok: false, error } };
}

function readPage(page: CollectedPage, job: Job, now: number): Reading {
  if (RATE_LIMIT_STATUSES.has(page.status)) {
    const pauseMs = parseRetryAfter(page.retryAfter, now) ?? THROTTLE.defaultPauseMs;
    return { kind: "rate_limited", pausedUntil: now + pauseMs };
  }
  const envelope = readMfcEnvelope(page);
  switch (envelope.kind) {
    case "item":
      return envelope.mfcItemId === job.mfcItemId
        ? { kind: "item", ogImage: envelope.ogImage }
        : failed("unexpected_page");
    case "challenge":
      return envelope;
    case "not_found":
      return failed(envelope.signedIn ? "hidden_or_missing" : "mfc_signed_out");
    case "unexpected":
      return failed("unexpected_page");
  }
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

  function liveRequester(job: Job, signal: AbortSignal): LiveRequester {
    return () => {
      const requester = waitersOf(state, job)[0]?.requester;
      if (signal.aborted || !requester) {
        throw new DOMException("no run waits for this item", "AbortError");
      }
      return requester;
    };
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
      return await withTimeout(clock, PICTURE_TIMEOUT_MS, signal, () =>
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
  ): Promise<Outcome> {
    return {
      kind: "result",
      result: { ok: true, html: page.html, picture: await pictureOf(ogImage, tabId, signal) },
    };
  }

  function fetchPage(lease: MfcTabLease, job: Job, signal: AbortSignal): Promise<CollectedPage> {
    const request = { kind: "page", mode: "fetch", mfcItemId: job.mfcItemId } as const;
    return throttle.load(signal, (timeout) =>
      deps.collectPage(lease.tabId, request, AbortSignal.any([signal, timeout])),
    );
  }

  /** A page that never came back from a borrowed tab is the tab's fault, so it is tried once more in one of the extension's own. */
  async function fetchItem(job: Job, requester: LiveRequester, signal: AbortSignal) {
    const lease = await mfcTabs.lease(requester, signal);
    try {
      return { page: await fetchPage(lease, job, signal), tabId: lease.tabId };
    } catch (error) {
      if (lease.kind === "owned" || signal.aborted || error instanceof PauseTooLongError) {
        throw error;
      }
    }
    mfcTabs.stopBorrowing();
    const own = await mfcTabs.lease(requester, signal);
    return { page: await fetchPage(own, job, signal), tabId: own.tabId };
  }

  async function afterChallenge(
    tabId: number,
    job: Job,
    deadline: number,
    signal: AbortSignal,
  ): Promise<{ readonly page: CollectedPage; readonly reading: Answer } | null> {
    const request = { kind: "page", mode: "document", mfcItemId: job.mfcItemId } as const;
    const done = new AbortController();
    const open = AbortSignal.any([
      signal,
      timeoutSignal(clock, deadline - clock.now(), done.signal),
    ]);
    try {
      for await (const navigation of mfcTabs.navigations(tabId, open)) {
        // The user's solve reloads the page, and that load counts against the throttle like the extension's own.
        if (navigation === "reloaded") await throttle.noteLoad();
        // A tab mid-navigation or on an error page has not answered yet.
        const page = await unlessAborted(open, deps.collectPage(tabId, request, open)).catch(
          () => null,
        );
        if (!page || page.status === CHALLENGE_STATUS) continue;
        const reading = readPage(page, job, clock.now());
        if (reading.kind !== "challenge") return { page, reading };
      }
      return null;
    } finally {
      done.abort();
    }
  }

  async function solveChallenge(
    job: Job,
    requester: LiveRequester,
    signal: AbortSignal,
  ): Promise<Outcome> {
    let tabId: number;
    try {
      tabId = await mfcTabs.showChallenge(requester, job.mfcItemId, signal);
    } catch (error) {
      if (signal.aborted || error instanceof PauseTooLongError) throw error;
      return failed("challenge_unsolved");
    }
    const deadline = clock.now() + CHALLENGE_WINDOW_MS;
    dispatch({ type: "needs_user", untilMs: deadline });
    const answer = await afterChallenge(tabId, job, deadline, signal);
    if (!answer) await mfcTabs.dismiss(tabId);
    await mfcTabs.handBack(requester, signal);
    signal.throwIfAborted();
    if (!answer) return failed("challenge_unsolved");
    const { page, reading } = answer;
    return reading.kind === "item" ? itemResult(page, reading.ogImage, tabId, signal) : reading;
  }

  async function attempt(job: Job, signal: AbortSignal): Promise<Outcome> {
    const requester = liveRequester(job, signal);
    try {
      const { page, tabId } = await fetchItem(job, requester, signal);
      const reading = readPage(page, job, clock.now());
      switch (reading.kind) {
        case "item":
          return await itemResult(page, reading.ogImage, tabId, signal);
        case "challenge":
          return await solveChallenge(job, requester, signal);
        case "result":
        case "rate_limited":
          return reading;
      }
    } catch (error) {
      if (error instanceof PauseTooLongError) {
        return { kind: "rate_limited", pausedUntil: error.pausedUntil };
      }
      return failed(error instanceof TimeoutError ? "timeout" : "unexpected_page");
    }
  }

  async function drain(): Promise<void> {
    for (;;) {
      dispatch({ type: "started" });
      const job = state.active;
      if (!job) break;
      const controller = new AbortController();
      current = { job, controller };
      const outcome = await attempt(job, controller.signal);
      current = null;
      if (controller.signal.aborted) continue;
      dispatch({ type: "answered", job, outcome, at: clock.now() });
      if (outcome.kind === "rate_limited") {
        const { mode } = state;
        await throttle.pause(mode.kind === "halted" ? mode.until : outcome.pausedUntil);
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
