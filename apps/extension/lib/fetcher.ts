import type { ItemError, ItemResult, PortPicture, RunEvent } from "@myakiba/mfc/bridge";
import { readMfcEnvelope } from "@myakiba/mfc/page";
import type { MfcItemId, MfcOgImage } from "@myakiba/mfc/page";
import type { Clock, SessionValue } from "./clock";
import { PAGE_TIMEOUT_MS } from "./collect";
import type { CollectRequest, CollectedPage } from "./collect";
import { TabTimeoutError, createMfcTabs } from "./mfc-tab";
import type { MfcTabLease, OwnedTab, TabsApi, WindowsApi } from "./mfc-tab";
import { toConfiguredUrl } from "./origins";
import type { Origins } from "./origins";
import { EMPTY_QUEUE, reduceQueue, waitersOf } from "./queue";
import type { QueueAction, RunKey } from "./queue";
import { createThrottle, parseRetryAfter } from "./throttle";
import type { ThrottleState } from "./throttle";

export const CHALLENGE_WINDOW_MS = 120_000;
const RATE_LIMIT_STATUSES = new Set([429, 503]);

export type FetcherDeps = {
  readonly tabs: TabsApi;
  readonly windows: WindowsApi;
  readonly clock: Clock;
  readonly random: () => number;
  readonly origins: Origins;
  readonly throttleState: SessionValue<ThrottleState>;
  readonly ownedTab: SessionValue<OwnedTab>;
  readonly collect: (tabId: number, request: CollectRequest) => Promise<CollectedPage>;
  readonly fetchPublicPicture: (url: URL) => Promise<PortPicture | null>;
};

export type FetchRun = {
  readonly key: RunKey;
  readonly requesterTabId: number;
  readonly mfcItemIds: readonly MfcItemId[];
  readonly emit: (event: RunEvent<PortPicture>) => void;
};

type Outcome =
  | { readonly kind: "result"; readonly result: ItemResult<PortPicture> }
  | { readonly kind: "rate_limited"; readonly retryAfterMs: number | null };

type Attempt = { readonly signal: AbortSignal; readonly requesterTabId: number | undefined };

class PageTimeoutError extends Error {
  constructor() {
    super(`the MFC page did not answer in ${PAGE_TIMEOUT_MS} ms`);
    this.name = "PageTimeoutError";
  }
}

function failed(error: ItemError): Outcome {
  return { kind: "result", result: { ok: false, error } };
}

export function createFetcher(deps: FetcherDeps) {
  const { clock, collect, origins } = deps;
  const throttle = createThrottle({ clock, random: deps.random, state: deps.throttleState });
  const mfcTabs = createMfcTabs({ ...deps, owned: deps.ownedTab });
  const listeners = new Map<RunKey, FetchRun["emit"]>();
  let state = EMPTY_QUEUE;
  let attempt: AbortController | null = null;
  let draining: Promise<void> | null = null;

  function dispatch(action: QueueAction): void {
    const next = reduceQueue(state, action);
    state = next.state;
    for (const { run, event } of next.emit) {
      listeners.get(run)?.(event);
      if (event.type === "done") listeners.delete(run);
    }
    if (state.active && waitersOf(state, state.active.mfcItemId).length === 0) attempt?.abort();
  }

  async function timeout(signal: AbortSignal): Promise<never> {
    await clock.sleep(PAGE_TIMEOUT_MS, signal);
    throw new PageTimeoutError();
  }

  async function withTimeout<T>(work: Promise<T>): Promise<T> {
    const timer = new AbortController();
    try {
      return await Promise.race([work, timeout(timer.signal)]);
    } finally {
      timer.abort();
    }
  }

  async function pictureOf(
    ogImage: MfcOgImage,
    collected: PortPicture | null,
  ): Promise<PortPicture | null> {
    if (ogImage.kind !== "picture") return null;
    if (ogImage.picture.access === "gated") return collected;
    const url = toConfiguredUrl(ogImage.picture.url, origins);
    if (!url) return null;
    try {
      return await deps.fetchPublicPicture(url);
    } catch {
      return null;
    }
  }

  async function solveChallenge(
    mfcItemId: MfcItemId,
    lease: MfcTabLease,
    { signal, requesterTabId }: Attempt,
  ): Promise<CollectedPage | null> {
    await throttle.waitTurn();
    try {
      const tabId = await mfcTabs.showChallenge(lease, mfcItemId);
      await throttle.pageLoaded();
      dispatch({
        type: "waiting",
        state: "needs_user",
        untilMs: clock.now() + CHALLENGE_WINDOW_MS,
      });
      await mfcTabs.waitPastChallenge(tabId, CHALLENGE_WINDOW_MS, signal);
      return await withTimeout(collect(tabId, { mode: "document", mfcItemId }));
    } catch {
      return null;
    } finally {
      await mfcTabs.handBack(requesterTabId);
    }
  }

  async function classify(
    mfcItemId: MfcItemId,
    page: CollectedPage,
    lease: MfcTabLease | null,
    context: Attempt,
  ): Promise<Outcome> {
    const envelope = readMfcEnvelope(page);
    switch (envelope.kind) {
      case "item": {
        if (envelope.mfcItemId !== mfcItemId) return failed("unexpected_page");
        const picture = await pictureOf(envelope.ogImage, page.picture);
        return { kind: "result", result: { ok: true, html: page.html, picture } };
      }
      case "challenge": {
        if (!lease) return failed("challenge_unsolved");
        const solved = await solveChallenge(mfcItemId, lease, context);
        return solved ? classify(mfcItemId, solved, null, context) : failed("challenge_unsolved");
      }
      case "not_found":
        return failed(envelope.signedIn ? "hidden_or_missing" : "mfc_signed_out");
      case "unexpected":
        return RATE_LIMIT_STATUSES.has(envelope.status)
          ? { kind: "rate_limited", retryAfterMs: parseRetryAfter(page.retryAfter, clock.now()) }
          : failed("unexpected_page");
    }
  }

  async function fetchItem(mfcItemId: MfcItemId, context: Attempt): Promise<Outcome> {
    try {
      const lease = await mfcTabs.lease(PAGE_TIMEOUT_MS);
      await throttle.pageLoaded();
      const page = await withTimeout(collect(lease.tabId, { mode: "fetch", mfcItemId }));
      return await classify(mfcItemId, page, lease, context);
    } catch (error) {
      return failed(
        error instanceof PageTimeoutError || error instanceof TabTimeoutError
          ? "timeout"
          : "unexpected_page",
      );
    }
  }

  async function fetchNext(): Promise<void> {
    await throttle.waitTurn();
    dispatch({ type: "started" });
    const active = state.active;
    if (!active) return;
    const controller = new AbortController();
    attempt = controller;
    const outcome = await fetchItem(active.mfcItemId, {
      signal: controller.signal,
      requesterTabId: waitersOf(state, active.mfcItemId)[0]?.requesterTabId,
    });
    attempt = null;
    if (outcome.kind === "rate_limited" && active.attempt === 0 && !controller.signal.aborted) {
      dispatch({
        type: "waiting",
        state: "backing_off",
        untilMs: await throttle.backOff(outcome.retryAfterMs),
      });
      dispatch({ type: "retried" });
      return;
    }
    dispatch({
      type: "settled",
      result: outcome.kind === "result" ? outcome.result : { ok: false, error: "rate_limited" },
    });
  }

  async function drain(): Promise<void> {
    while (state.active || state.pending.length > 0) await fetchNext();
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
        requesterTabId: run.requesterTabId,
        mfcItemIds: run.mfcItemIds,
      });
      kick();
    },
    cancel(key: RunKey): void {
      dispatch({ type: "cancelled", run: key });
    },
    noteTabActivated: (tabId: number) => mfcTabs.noteActivated(tabId),
    /** Resolves when the queue has drained and the owned tab is closed. */
    idle: (): Promise<void> => draining ?? Promise.resolve(),
  };
}

export type Fetcher = ReturnType<typeof createFetcher>;
