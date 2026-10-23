import type { ItemError, PortPicture, RunEvent } from "@myakiba/mfc/bridge";
import { readMfcEnvelope } from "@myakiba/mfc/page";
import type { MfcItemId, MfcOgImage } from "@myakiba/mfc/page";
import { TimeoutError, timeoutSignal, unlessAborted } from "./clock";
import type { Clock, SessionValue } from "./clock";
import { NO_STATUS } from "./collect";
import type { CollectedPage, PageRequest } from "./collect";
import { createMfcTabs } from "./mfc-tab";
import type { MfcTabLease, WindowsApi } from "./mfc-tab";
import { ownedTab } from "./owned-tab";
import type { LiveRequester, OwnedTab, TabsApi } from "./owned-tab";
import { toConfiguredUrl } from "./origins";
import type { Origins } from "./origins";
import { PICTURE_TIMEOUT_MS } from "./picture";
import { EMPTY_QUEUE, reduceQueue, sameJob, waitersOf } from "./queue";
import type { Job, Outcome, QueueAction, Requester, RunKey } from "./queue";
import { HaltedError, THROTTLE, createThrottle, parseRetryAfter } from "./throttle";
import type { ThrottleState } from "./throttle";

export const CHALLENGE_WINDOW_MS = 120_000;
const RATE_LIMIT_STATUSES = new Set([429, 503]);
/**
 * Cloudflare serves its challenge with 403. A loaded page cannot read the header that marks it, nor rely on its localized title,
 * so every 403 counts as the challenge. A cap on repeat reads would not catch a real MFC 403, because a localized challenge reads the same each time too.
 */
const CHALLENGE_STATUS = 403;
const READ_TRIES = 3;
const READ_RETRY_MS = 1000;

export type FetcherDeps = {
  readonly tabs: TabsApi;
  readonly windows: WindowsApi;
  readonly clock: Clock;
  readonly random: () => number;
  readonly origins: Origins;
  readonly throttleState: SessionValue<ThrottleState>;
  readonly ownedTab: SessionValue<OwnedTab>;
  readonly ownedPictureTab: SessionValue<OwnedTab>;
  readonly collectPage: (
    tabId: number,
    request: PageRequest,
    signal: AbortSignal,
  ) => Promise<CollectedPage>;
  /** Runs in the MFC tab, so the request carries the user's MFC cookies. */
  readonly fetchGatedPicture: (
    tabId: number,
    url: string,
    signal: AbortSignal,
  ) => Promise<PortPicture | null>;
  /** Runs in the picture tab, and answers no picture unless the tab shows `url`. */
  readonly fetchPublicPicture: (
    tabId: number,
    url: string,
    signal: AbortSignal,
  ) => Promise<PortPicture | null>;
};

export type FetchRun = {
  readonly key: RunKey;
  readonly requester: Requester;
  readonly mfcItemIds: readonly MfcItemId[];
  readonly emit: (event: RunEvent<PortPicture>) => void;
};

type Reading =
  | { readonly kind: "item"; readonly ogImage: MfcOgImage }
  | { readonly kind: "challenge"; readonly status: number; readonly pausedUntil: number | null }
  | Exclude<Outcome, { readonly kind: "halted" }>;

type Answer = Exclude<Reading, { readonly kind: "challenge" }>;

type ItemContext = {
  readonly tabId: number;
  readonly requester: LiveRequester;
  readonly signal: AbortSignal;
};

function failed(error: ItemError): Extract<Outcome, { readonly kind: "result" }> {
  return { kind: "result", result: { ok: false, error } };
}

function readPage(page: CollectedPage, job: Job, now: number): Reading {
  const pauseMs = parseRetryAfter(page.retryAfter, now);
  // Cloudflare may serve its challenge with 503 and Retry-After. It still wants a person, after the pause.
  const challenged = page.cfMitigated?.trim().toLowerCase() === "challenge";
  if (!challenged && RATE_LIMIT_STATUSES.has(page.status)) {
    return { kind: "rate_limited", pausedUntil: now + (pauseMs ?? THROTTLE.defaultPauseMs) };
  }
  const envelope = readMfcEnvelope(page);
  switch (envelope.kind) {
    case "item":
      return envelope.mfcItemId === job.mfcItemId
        ? { kind: "item", ogImage: envelope.ogImage }
        : failed("unexpected_page");
    case "challenge":
      return {
        kind: "challenge",
        status: page.status,
        pausedUntil: pauseMs === null ? null : now + pauseMs,
      };
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
  const pictureTab = ownedTab({
    tabs: deps.tabs,
    clock,
    origin: origins.mfcStatic,
    record: deps.ownedPictureTab,
    throttle,
    turnMs: PICTURE_TIMEOUT_MS,
  });
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

  /** Each picture is a request to MFC, so it takes a throttle turn of its own, and its budget starts with that turn. */
  async function pictureOf(
    ogImage: MfcOgImage,
    { tabId, requester, signal }: ItemContext,
  ): Promise<PortPicture | null> {
    if (ogImage.kind !== "picture") return null;
    const { picture } = ogImage;
    const url = toConfiguredUrl(picture.url, origins);
    if (!url) return null;
    try {
      return picture.access === "gated"
        ? await throttle.load(
            signal,
            (timeout) =>
              deps.fetchGatedPicture(tabId, picture.url, AbortSignal.any([signal, timeout])),
            PICTURE_TIMEOUT_MS,
          )
        : await pictureTab.loadAndRead(requester, url.href, signal, (pictureTabId, inTurn) =>
            deps.fetchPublicPicture(pictureTabId, picture.url, inTurn),
          );
    } catch {
      return null;
    }
  }

  async function itemResult(
    page: CollectedPage,
    ogImage: MfcOgImage,
    context: ItemContext,
  ): Promise<Outcome> {
    return {
      kind: "result",
      result: { ok: true, html: page.html, picture: await pictureOf(ogImage, context) },
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
      if (lease.kind === "owned" || signal.aborted || error instanceof HaltedError) {
        throw error;
      }
    }
    mfcTabs.stopBorrowing();
    const own = await mfcTabs.lease(requester, signal);
    return { page: await fetchPage(own, job, signal), tabId: own.tabId };
  }

  async function readShown(
    tabId: number,
    job: Job,
    open: AbortSignal,
  ): Promise<CollectedPage | null> {
    const request = { kind: "page", mode: "document", mfcItemId: job.mfcItemId } as const;
    for (let tries = 1; !open.aborted; tries++) {
      const page = await unlessAborted(open, deps.collectPage(tabId, request, open)).catch(
        () => null,
      );
      if (page && page.status !== NO_STATUS) return page;
      if (tries === READ_TRIES) break;
      await clock.sleep(READ_RETRY_MS, open);
    }
    return null;
  }

  async function afterChallenge(
    tabId: number,
    job: Job,
    servedWith: number,
    deadline: number,
    signal: AbortSignal,
  ): Promise<{ readonly page: CollectedPage; readonly reading: Answer } | null> {
    // Shown in the tab, a challenge Cloudflare served with 503 reads as a bare 503.
    const stillShown = (status: number) =>
      status === CHALLENGE_STATUS || (status === servedWith && status !== 200);
    const done = new AbortController();
    const open = AbortSignal.any([
      signal,
      timeoutSignal(clock, deadline - clock.now(), done.signal),
    ]);
    try {
      for await (const navigation of mfcTabs.navigations(tabId, open)) {
        // The user's solve reloads the page, and that load counts against the throttle like the extension's own.
        if (navigation === "reloaded") await throttle.noteLoad();
        const page = await readShown(tabId, job, open);
        if (!page || stillShown(page.status)) continue;
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
    servedWith: number,
    signal: AbortSignal,
  ): Promise<Outcome> {
    let tabId: number;
    try {
      tabId = await mfcTabs.showChallenge(requester, job.mfcItemId, signal);
    } catch (error) {
      if (signal.aborted || error instanceof HaltedError) throw error;
      return failed("challenge_unsolved");
    }
    const deadline = clock.now() + CHALLENGE_WINDOW_MS;
    dispatch({ type: "needs_user", untilMs: deadline });
    const answer = await afterChallenge(tabId, job, servedWith, deadline, signal);
    await mfcTabs.handBack(requester, signal);
    signal.throwIfAborted();
    if (!answer) return failed("challenge_unsolved");
    const { page, reading } = answer;
    return reading.kind === "item"
      ? itemResult(page, reading.ogImage, { tabId, requester, signal })
      : reading;
  }

  async function attempt(job: Job, signal: AbortSignal): Promise<Outcome> {
    const requester = liveRequester(job, signal);
    try {
      const { page, tabId } = await fetchItem(job, requester, signal);
      const reading = readPage(page, job, clock.now());
      switch (reading.kind) {
        case "item":
          return await itemResult(page, reading.ogImage, { tabId, requester, signal });
        case "challenge":
          if (reading.pausedUntil !== null) await throttle.pauseOrHalt(reading.pausedUntil);
          return await solveChallenge(job, requester, reading.status, signal);
        case "result":
        case "rate_limited":
          return reading;
      }
    } catch (error) {
      if (error instanceof HaltedError) return { kind: "halted", until: error.until };
      return failed(error instanceof TimeoutError ? "timeout" : "unexpected_page");
    }
  }

  async function booked(outcome: Outcome): Promise<Outcome> {
    switch (outcome.kind) {
      case "halted":
        return outcome;
      case "result":
        await throttle.answered();
        return outcome;
      case "rate_limited": {
        const { haltedUntil } = await throttle.rateLimited(outcome.pausedUntil);
        return haltedUntil === null ? outcome : { kind: "halted", until: haltedUntil };
      }
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
      dispatch({ type: "answered", job, outcome: await booked(outcome) });
    }
    await mfcTabs.release();
    await pictureTab.release();
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
    async noteTabActivated(tabId: number): Promise<void> {
      await Promise.all([mfcTabs.claim(tabId), pictureTab.claim(tabId)]);
    },
    /** Runs the queue once, which closes a tab left open by a worker that stopped mid-run. */
    resume: kick,
  };
}

export type Fetcher = ReturnType<typeof createFetcher>;
