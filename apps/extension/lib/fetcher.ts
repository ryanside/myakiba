import type { ItemError, PortPicture, RunEvent } from "@myakiba/mfc/bridge";
import { readMfcEnvelope } from "@myakiba/mfc/page";
import type { MfcItemId, MfcOgImage } from "@myakiba/mfc/page";
import { Panic, Result, UnhandledException } from "better-result";
import { TimeoutError, timeoutSignal, unlessAborted } from "./clock";
import type { Clock, SessionValue } from "./clock";
import { NO_STATUS, PAGE_TIMEOUT_MS } from "./collect";
import type {
  CollectedPage,
  CollectorFailure,
  PageCollectFailure,
  PageRequest,
  PictureFailure,
} from "./collect";
import { AttemptAbandoned } from "./errors/attempt-abandoned";
import { MfcChallengeUnsolved } from "./errors/mfc-challenge-unsolved";
import { MfcItemHiddenOrMissing } from "./errors/mfc-item-hidden-or-missing";
import { MfcLoadTimedOut } from "./errors/mfc-load-timed-out";
import { MfcPageUnrecognized } from "./errors/mfc-page-unrecognized";
import { MfcQueueHalted } from "./errors/mfc-queue-halted";
import { MfcRateLimited } from "./errors/mfc-rate-limited";
import { MfcSignedOut } from "./errors/mfc-signed-out";
import { MfcTabUnavailable } from "./errors/mfc-tab-unavailable";
import { MfcWrongItem } from "./errors/mfc-wrong-item";
import { createMfcTabs } from "./mfc-tab";
import type { MfcTabLease, WindowsApi } from "./mfc-tab";
import { TabUnavailableError, ownedTab } from "./owned-tab";
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
  ) => Promise<Result<CollectedPage, PageCollectFailure>>;
  /** Runs in the MFC tab, so the request carries the user's MFC cookies. */
  readonly fetchGatedPicture: (
    tabId: number,
    url: string,
    signal: AbortSignal,
  ) => Promise<Result<PortPicture | null, PictureCollectFailure>>;
  /** Runs in the picture tab, and answers no picture unless the tab shows `url`. */
  readonly fetchPublicPicture: (
    tabId: number,
    url: string,
    signal: AbortSignal,
  ) => Promise<Result<PortPicture | null, PictureCollectFailure>>;
};

export type FetchRun = {
  readonly key: RunKey;
  readonly requester: Requester;
  readonly mfcItemIds: readonly MfcItemId[];
  readonly emit: (event: RunEvent<PortPicture>) => void;
};

/** What MFC showed for the item: the item itself, or a challenge for the user to solve. */
type Reading =
  | { readonly kind: "item"; readonly ogImage: MfcOgImage }
  | { readonly kind: "challenge"; readonly status: number; readonly pausedUntil: number | null };

type PageRejected =
  | MfcRateLimited
  | MfcSignedOut
  | MfcItemHiddenOrMissing
  | MfcWrongItem
  | MfcPageUnrecognized;

/** How a call into the throttle or the tabs fails. Both still throw, so each call is wrapped where it is made. */
type LoadFailure =
  | MfcLoadTimedOut
  | MfcQueueHalted
  | AttemptAbandoned
  | MfcTabUnavailable
  | UnhandledException;

type PageFailure = LoadFailure | PageCollectFailure;

type PictureCollectFailure = CollectorFailure | PictureFailure;

type PictureReadFailure = LoadFailure | PictureCollectFailure;

type AttemptFailure = PageFailure | PageRejected | MfcChallengeUnsolved;

type ItemPage = { readonly html: string; readonly picture: PortPicture | null };

type ShownItem = { readonly page: CollectedPage; readonly ogImage: MfcOgImage };

type ItemContext = {
  readonly tabId: number;
  readonly requester: LiveRequester;
  readonly signal: AbortSignal;
};

/**
 * What a failed page fetch says about its tab. The browser's error page keeps the MFC URL, so an owned tab whose collector
 * failed is closed rather than reused. A page that never came back from a borrowed tab is the tab's fault, so it is tried
 * once more in one of the extension's own.
 */
const AFTER_PAGE_FAILURE = {
  CollectorInjectionFailed: { closeOwned: true, retryOwned: true },
  CollectorAnswerInvalid: { closeOwned: true, retryOwned: true },
  MfcPageFetchFailed: { closeOwned: true, retryOwned: true },
  MfcTabUnavailable: { closeOwned: true, retryOwned: true },
  UnhandledException: { closeOwned: true, retryOwned: true },
  MfcLoadTimedOut: { closeOwned: false, retryOwned: true },
  MfcQueueHalted: { closeOwned: false, retryOwned: false },
  AttemptAbandoned: { closeOwned: false, retryOwned: false },
} as const satisfies Record<
  PageFailure["_tag"],
  { readonly closeOwned: boolean; readonly retryOwned: boolean }
>;

function failed(error: ItemError): Extract<Outcome, { readonly kind: "result" }> {
  return { kind: "result", result: { ok: false, error } };
}

/** Ends the Result path at the queue's Outcome, until the queue takes the Result itself. Null answers nothing. */
function outcomeOf(error: AttemptFailure): Outcome | null {
  return error.match({
    MfcSignedOut: () => failed("mfc_signed_out"),
    MfcItemHiddenOrMissing: () => failed("hidden_or_missing"),
    MfcWrongItem: () => failed("unexpected_page"),
    MfcPageUnrecognized: () => failed("unexpected_page"),
    MfcPageFetchFailed: () => failed("unexpected_page"),
    CollectorInjectionFailed: () => failed("unexpected_page"),
    CollectorAnswerInvalid: () => failed("unexpected_page"),
    MfcTabUnavailable: () => failed("unexpected_page"),
    UnhandledException: () => failed("unexpected_page"),
    MfcLoadTimedOut: () => failed("timeout"),
    MfcChallengeUnsolved: () => failed("challenge_unsolved"),
    MfcRateLimited: ({ pausedUntil }): Outcome => ({ kind: "rate_limited", pausedUntil }),
    MfcQueueHalted: ({ until }): Outcome => ({ kind: "halted", until }),
    AttemptAbandoned: () => null,
  });
}

function loadFailure(cause: unknown, signal: AbortSignal, phase: "page" | "tab"): LoadFailure {
  // A defect reaches attempt as a Panic rather than reading as a failed load.
  if (Panic.is(cause)) throw cause;
  if (signal.aborted) return new AttemptAbandoned();
  if (cause instanceof TimeoutError) {
    return new MfcLoadTimedOut({ timeoutMs: cause.timeoutMs, phase });
  }
  if (cause instanceof HaltedError) return new MfcQueueHalted({ until: cause.until });
  if (cause instanceof TabUnavailableError) {
    return new MfcTabUnavailable({ tabId: cause.tabId, reason: cause.reason });
  }
  return new UnhandledException({ cause });
}

function loading<T>(
  load: () => Promise<T>,
  signal: AbortSignal,
  phase: "page" | "tab",
): Promise<Result<T, LoadFailure>> {
  return Result.tryPromise({ try: load, catch: (cause) => loadFailure(cause, signal, phase) });
}

/** Only a halt or an abandoned attempt keeps its meaning when the challenge's tab cannot be shown. */
function notShown(
  error: LoadFailure,
  mfcItemId: MfcItemId,
): MfcQueueHalted | AttemptAbandoned | MfcChallengeUnsolved {
  const unsolved = () => new MfcChallengeUnsolved({ mfcItemId, reason: "not_shown", cause: error });
  return error.match({
    MfcQueueHalted: (halted) => halted,
    AttemptAbandoned: (abandoned) => abandoned,
    MfcLoadTimedOut: unsolved,
    MfcTabUnavailable: unsolved,
    UnhandledException: unsolved,
  });
}

function readPage(page: CollectedPage, job: Job, now: number): Result<Reading, PageRejected> {
  const { mfcItemId } = job;
  const pauseMs = parseRetryAfter(page.retryAfter, now);
  // Cloudflare may serve its challenge with 503 and Retry-After. It still wants a person, after the pause.
  const challenged = page.cfMitigated?.trim().toLowerCase() === "challenge";
  if (!challenged && RATE_LIMIT_STATUSES.has(page.status)) {
    const pausedUntil = now + (pauseMs ?? THROTTLE.defaultPauseMs);
    return Result.err(new MfcRateLimited({ mfcItemId, status: page.status, pausedUntil }));
  }
  const envelope = readMfcEnvelope(page);
  switch (envelope.kind) {
    case "item":
      return envelope.mfcItemId === mfcItemId
        ? Result.ok({ kind: "item", ogImage: envelope.ogImage })
        : Result.err(new MfcWrongItem({ expected: mfcItemId, found: envelope.mfcItemId }));
    case "challenge":
      return Result.ok({
        kind: "challenge",
        status: page.status,
        pausedUntil: pauseMs === null ? null : now + pauseMs,
      });
    case "not_found":
      return Result.err(
        envelope.signedIn
          ? new MfcItemHiddenOrMissing({ mfcItemId })
          : new MfcSignedOut({ mfcItemId }),
      );
    case "unexpected":
      return Result.err(new MfcPageUnrecognized({ mfcItemId, status: envelope.status }));
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

  async function pictureOf(
    ogImage: MfcOgImage,
    { tabId, requester, signal }: ItemContext,
  ): Promise<Result<PortPicture | null, PictureReadFailure>> {
    if (ogImage.kind !== "picture") return Result.ok(null);
    const { picture } = ogImage;
    const url = toConfiguredUrl(picture.url, origins);
    if (!url) return Result.ok(null);
    const read =
      picture.access === "gated"
        ? await loading(
            () =>
              throttle.load(
                signal,
                (timeout) =>
                  deps.fetchGatedPicture(tabId, picture.url, AbortSignal.any([signal, timeout])),
                PICTURE_TIMEOUT_MS,
              ),
            signal,
            "page",
          )
        : await loading(
            () =>
              pictureTab.loadAndRead(requester, url.href, signal, (pictureTabId, inTurn) =>
                deps.fetchPublicPicture(pictureTabId, picture.url, inTurn),
              ),
            signal,
            "tab",
          );
    return Result.flatten(read);
  }

  /** A picture is optional, so an item whose picture fails imports without one. */
  async function itemPage(
    page: CollectedPage,
    ogImage: MfcOgImage,
    context: ItemContext,
  ): Promise<ItemPage> {
    const picture = await pictureOf(ogImage, context);
    return { html: page.html, picture: picture.unwrapOr(null) };
  }

  async function fetchPage(
    lease: MfcTabLease,
    job: Job,
    signal: AbortSignal,
  ): Promise<Result<CollectedPage, PageFailure>> {
    const request = { kind: "page", mode: "fetch", mfcItemId: job.mfcItemId } as const;
    const loaded = await loading(
      () =>
        throttle.load(signal, async (timeout) => {
          const page = await deps.collectPage(
            lease.tabId,
            request,
            AbortSignal.any([signal, timeout]),
          );
          // The turn's timeout stops the collector, which then answers that its fetch was aborted.
          return page.mapError((failure) =>
            timeout.aborted
              ? new MfcLoadTimedOut({ timeoutMs: PAGE_TIMEOUT_MS, phase: "page" })
              : failure,
          );
        }),
      signal,
      "page",
    );
    const page = Result.flatten(loaded);
    if (
      page.isErr() &&
      lease.kind === "owned" &&
      AFTER_PAGE_FAILURE[page.error._tag].closeOwned &&
      !signal.aborted
    ) {
      await mfcTabs.closeOwned();
    }
    return page;
  }

  function fetchItem(
    job: Job,
    requester: LiveRequester,
    signal: AbortSignal,
  ): Promise<Result<{ readonly page: CollectedPage; readonly tabId: number }, PageFailure>> {
    const lease = () => loading(() => mfcTabs.lease(requester, signal), signal, "tab");
    return Result.gen(async function* () {
      const first = yield* Result.await(lease());
      const page = await fetchPage(first, job, signal);
      const retry =
        page.isErr() &&
        first.kind === "borrowed" &&
        AFTER_PAGE_FAILURE[page.error._tag].retryOwned &&
        !signal.aborted;
      if (!retry) return page.map((collected) => ({ page: collected, tabId: first.tabId }));
      mfcTabs.stopBorrowing();
      const own = yield* Result.await(lease());
      const ownPage = await fetchPage(own, job, signal);
      return ownPage.map((collected) => ({ page: collected, tabId: own.tabId }));
    });
  }

  /** Any read that fails means the page is not ready yet. */
  async function readShown(
    tabId: number,
    job: Job,
    open: AbortSignal,
  ): Promise<CollectedPage | null> {
    const request = { kind: "page", mode: "document", mfcItemId: job.mfcItemId } as const;
    for (let tries = 1; !open.aborted; tries++) {
      const read = await loading(
        () => unlessAborted(open, deps.collectPage(tabId, request, open)),
        open,
        "page",
      );
      const page = Result.flatten(read);
      if (page.isOk() && page.value.status !== NO_STATUS) return page.value;
      if (tries === READ_TRIES) break;
      await clock.sleep(READ_RETRY_MS, open);
    }
    return null;
  }

  /** Waits for the challenge's tab to show something else. Null means it never did. */
  async function afterChallenge(
    tabId: number,
    job: Job,
    servedWith: number,
    deadline: number,
    signal: AbortSignal,
  ): Promise<Result<ShownItem, PageRejected> | null> {
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
        if (reading.isErr()) return Result.err(reading.error);
        if (reading.value.kind === "item") {
          return Result.ok({ page, ogImage: reading.value.ogImage });
        }
      }
      return null;
    } finally {
      done.abort();
    }
  }

  function solveChallenge(
    job: Job,
    requester: LiveRequester,
    servedWith: number,
    signal: AbortSignal,
  ): Promise<Result<ItemPage, AttemptFailure>> {
    const { mfcItemId } = job;
    return Result.gen(async function* () {
      const shown = await loading(
        () => mfcTabs.showChallenge(requester, mfcItemId, signal),
        signal,
        "tab",
      );
      const tabId = yield* shown.mapError((failure) => notShown(failure, mfcItemId));
      const deadline = clock.now() + CHALLENGE_WINDOW_MS;
      dispatch({ type: "needs_user", untilMs: deadline });
      const answer = await afterChallenge(tabId, job, servedWith, deadline, signal);
      await mfcTabs.handBack(requester, signal);
      if (signal.aborted) return Result.err(new AttemptAbandoned());
      if (answer === null) {
        return Result.err(new MfcChallengeUnsolved({ mfcItemId, reason: "unanswered" }));
      }
      const { page, ogImage } = yield* answer;
      return Result.ok(await itemPage(page, ogImage, { tabId, requester, signal }));
    });
  }

  /**
   * Answers one item, and is where its failures end. An expected failure is logged and answered with its wire code.
   * A defect is reported and answered unexpected_page, so the queue moves on instead of retrying it forever.
   */
  async function attempt(job: Job, signal: AbortSignal): Promise<Outcome | null> {
    const requester = liveRequester(job, signal);
    try {
      const answer = await Result.gen(async function* () {
        const { page, tabId } = yield* Result.await(fetchItem(job, requester, signal));
        const reading = yield* readPage(page, job, clock.now());
        if (reading.kind === "item") {
          return Result.ok(await itemPage(page, reading.ogImage, { tabId, requester, signal }));
        }
        if (reading.pausedUntil !== null) await throttle.pauseOrHalt(reading.pausedUntil);
        return await solveChallenge(job, requester, reading.status, signal);
      });
      if (answer.isOk()) return { kind: "result", result: { ok: true, ...answer.value } };
      const outcome = outcomeOf(answer.error);
      if (outcome !== null && outcome.kind !== "rate_limited") {
        console.warn(`${answer.error._tag} for MFC item ${job.mfcItemId}: ${answer.error.message}`);
      }
      return outcome;
    } catch (error) {
      console.error(
        `MFC item ${job.mfcItemId} failed on a defect, so it answers unexpected_page`,
        error,
      );
      return failed("unexpected_page");
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
      if (outcome === null || controller.signal.aborted) continue;
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
