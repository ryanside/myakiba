import type { ItemFetchErrorCode } from "@myakiba/contracts/mfc-items/fetch-errors";
import type { PortPicture, RunEvent } from "@myakiba/mfc/bridge";
import { isCloudflareChallenge, readMfcEnvelope } from "@myakiba/mfc/page";
import type { MfcItemId, MfcOgImage } from "@myakiba/mfc/page";
import { Result, panic } from "better-result";
import { timeoutSignal, unlessAborted } from "./clock";
import type { Clock } from "./clock";
import { NO_STATUS } from "./collect";
import type {
  CollectedPage,
  CollectorFailure,
  PageCollectFailure,
  PageRequest,
  PictureFailureSummary,
} from "./collect";
import { MfcChallengeUnsolved } from "./errors/mfc-challenge-unsolved";
import { MfcItemHiddenOrMissing } from "./errors/mfc-item-hidden-or-missing";
import { MfcPageUnrecognized } from "./errors/mfc-page-unrecognized";
import type { MfcQueueHalted } from "./errors/mfc-queue-halted";
import { MfcRateLimited } from "./errors/mfc-rate-limited";
import { MfcSignedOut } from "./errors/mfc-signed-out";
import { MfcWrongItem } from "./errors/mfc-wrong-item";
import type { SessionStorageUnavailable } from "./errors/session-storage-unavailable";
import { createMfcTabs } from "./mfc-tab";
import type { ChallengeShowFailure, LeaseFailure, MfcTabLease } from "./mfc-tab";
import { ownedTab } from "./owned-tab";
import type { LiveRequester, OwnedTab, TabOpenFailure } from "./owned-tab";
import { toConfiguredUrl } from "./origins";
import type { SessionValue } from "./session-value";
import type { Origins } from "./origins";
import { PICTURE_TIMEOUT_MS } from "./picture";
import { EMPTY_QUEUE, reduceQueue, sameJob, waitersOf } from "./queue";
import type { ItemOutcome, ItemPage, Job, QueueAction, Requester, RunKey } from "./queue";
import { resultTabs } from "./tabs";
import type { TabsApi, WindowsApi } from "./tabs";
import { THROTTLE, createThrottle, parseRetryAfter } from "./throttle";
import type { ThrottleState, TurnFailure } from "./throttle";

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

type PageFailure = TurnFailure | PageCollectFailure;

type ItemFetchFailure = PageFailure | LeaseFailure;

type PictureCollectFailure = CollectorFailure | PictureFailureSummary;

type PictureReadFailure = TurnFailure | TabOpenFailure | PictureCollectFailure;

type AttemptFailure =
  | ItemFetchFailure
  | PageRejected
  | MfcChallengeUnsolved
  | SessionStorageUnavailable;

type ShownItem = { readonly page: CollectedPage; readonly ogImage: MfcOgImage };

type ItemContext = {
  readonly mfcItemId: MfcItemId;
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
  MfcLoadTimedOut: { closeOwned: false, retryOwned: true },
  MfcQueueHalted: { closeOwned: false, retryOwned: false },
} as const satisfies Record<
  PageFailure["_tag"],
  { readonly closeOwned: boolean; readonly retryOwned: boolean }
>;

/** Only a halt keeps its meaning when the challenge's tab cannot be shown. */
function notShown(
  error: ChallengeShowFailure,
  mfcItemId: MfcItemId,
): MfcQueueHalted | MfcChallengeUnsolved {
  const unsolved = () => new MfcChallengeUnsolved({ mfcItemId, reason: "not_shown", cause: error });
  return error.match({
    MfcQueueHalted: (halted) => halted,
    MfcLoadTimedOut: unsolved,
    MfcTabUnavailable: unsolved,
    TabClosed: unsolved,
    TabEditRefused: unsolved,
    TabOpenFailed: unsolved,
    WindowFocusRefused: unsolved,
    SessionStorageUnavailable: unsolved,
  });
}

/** What each failure means for the runs waiting for its item. */
function outcomeOf(failure: AttemptFailure): ItemOutcome {
  const failed = (code: ItemFetchErrorCode) => (): ItemOutcome => ({ kind: "failed", code });
  return failure.match({
    MfcChallengeUnsolved: (): ItemOutcome => ({ kind: "challenge_unsolved" }),
    MfcQueueHalted: ({ until }): ItemOutcome => ({ kind: "halted", until }),
    MfcRateLimited: ({ pausedUntil }): ItemOutcome => ({ kind: "backing_off", until: pausedUntil }),
    MfcSignedOut: failed("mfc_signed_out"),
    MfcItemHiddenOrMissing: failed("hidden_or_missing"),
    MfcLoadTimedOut: failed("timeout"),
    MfcWrongItem: failed("unexpected_page"),
    MfcPageUnrecognized: failed("unexpected_page"),
    MfcPageFetchFailed: failed("unexpected_page"),
    CollectorInjectionFailed: failed("unexpected_page"),
    CollectorAnswerInvalid: failed("unexpected_page"),
    MfcTabUnavailable: failed("unexpected_page"),
    TabClosed: failed("unexpected_page"),
    TabEditRefused: failed("unexpected_page"),
    TabOpenFailed: failed("unexpected_page"),
    TabQueryFailed: failed("unexpected_page"),
    SessionStorageUnavailable: failed("unexpected_page"),
  });
}

function readPage(page: CollectedPage, job: Job, now: number): Result<Reading, PageRejected> {
  const { mfcItemId } = job;
  const pauseMs = parseRetryAfter(page.retryAfter, now);
  // Cloudflare may serve its challenge with 503 and Retry-After. It still wants a person, after the pause.
  const challenged = isCloudflareChallenge(page.cfMitigated);
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
  const tabs = resultTabs(deps.tabs, deps.windows);
  const mfcTabs = createMfcTabs({ tabs, clock, origins, owned: deps.ownedTab, throttle });
  const pictureTab = ownedTab({
    tabs,
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

  function liveRequester(job: Job): LiveRequester {
    let last =
      waitersOf(state, job)[0]?.requester ??
      panic(`MFC item ${job.mfcItemId} started with no run waiting for it.`);
    return () => {
      last = waitersOf(state, job)[0]?.requester ?? last;
      return last;
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
    if (picture.access === "public") {
      return pictureTab.loadAndRead(requester, url.href, signal, (pictureTabId, inTurn) =>
        deps.fetchPublicPicture(pictureTabId, picture.url, inTurn),
      );
    }
    return throttle.load(
      signal,
      (timeout) => deps.fetchGatedPicture(tabId, picture.url, AbortSignal.any([signal, timeout])),
      PICTURE_TIMEOUT_MS,
    );
  }

  /** A picture is optional, so an item whose picture fails imports without one, and the failure is only logged. */
  async function itemPage(
    page: CollectedPage,
    ogImage: MfcOgImage,
    context: ItemContext,
  ): Promise<ItemPage> {
    const picture = await pictureOf(ogImage, context);
    const logged = picture.tapError((failure) => {
      if (!context.signal.aborted) {
        console.warn(
          `${failure._tag} for MFC item ${context.mfcItemId}'s picture: ${failure.message}`,
        );
      }
    });
    return { html: page.html, picture: logged.unwrapOr(null) };
  }

  /**
   * The turn's timeout stops the collector, and the throttle reads what it then answers as that timeout. The item fails
   * for its page, so a tab that closed but could not be forgotten in storage is only logged.
   */
  async function fetchPage(
    lease: MfcTabLease,
    job: Job,
    signal: AbortSignal,
  ): Promise<Result<CollectedPage, PageFailure>> {
    const request = { kind: "page", mode: "fetch", mfcItemId: job.mfcItemId } as const;
    const page = await throttle.load(signal, (timeout) =>
      deps.collectPage(lease.tabId, request, AbortSignal.any([signal, timeout])),
    );
    if (
      page.isErr() &&
      lease.kind === "owned" &&
      AFTER_PAGE_FAILURE[page.error._tag].closeOwned &&
      !signal.aborted
    ) {
      const closed = await mfcTabs.closeOwned();
      closed.tapError((failure) => {
        console.warn(`${failure._tag} for MFC item ${job.mfcItemId}: ${failure.message}`);
      });
    }
    return page;
  }

  function fetchItem(
    job: Job,
    requester: LiveRequester,
    signal: AbortSignal,
  ): Promise<Result<{ readonly page: CollectedPage; readonly tabId: number }, ItemFetchFailure>> {
    const lease = () => mfcTabs.lease(requester, signal);
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
      const page = await unlessAborted(open, deps.collectPage(tabId, request, open));
      if (page?.isOk() && page.value.status !== NO_STATUS) return page.value;
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
  ): Promise<Result<ShownItem, PageRejected | SessionStorageUnavailable> | null> {
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
        if (navigation === "reloaded") {
          const noted = await throttle.noteLoad();
          if (noted.isErr()) return Result.err(noted.error);
        }
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
      const shown = await mfcTabs.showChallenge(requester, mfcItemId, signal);
      const tabId = yield* shown.mapError((failure) => notShown(failure, mfcItemId));
      const deadline = clock.now() + CHALLENGE_WINDOW_MS;
      dispatch({ type: "needs_user", untilMs: deadline });
      const answer = await afterChallenge(tabId, job, servedWith, deadline, signal);
      // Handing focus back is a courtesy: a run whose tab closed meanwhile still gets its answer.
      await mfcTabs.handBack(requester, signal);
      if (answer === null) {
        return Result.err(new MfcChallengeUnsolved({ mfcItemId, reason: "unanswered" }));
      }
      const { page, ogImage } = yield* answer;
      return Result.ok(await itemPage(page, ogImage, { mfcItemId, tabId, requester, signal }));
    });
  }

  /**
   * A defect, whatever step throws it, is reported with this and answered as unexpected_page, so the queue moves on
   * instead of retrying it forever.
   */
  const defect = (job: Job) => ({
    report: `MFC item ${job.mfcItemId} failed on a defect, so it answers unexpected_page`,
    outcome: { kind: "failed", code: "unexpected_page" } as const satisfies ItemOutcome,
  });

  /**
   * Answers one item, and is where its failures end. An expected failure is logged and answered as it is, and a defect
   * as `defect` says. Null answers nothing, because the signal aborted: no run waits for the item any more.
   */
  async function attempt(job: Job, signal: AbortSignal): Promise<ItemOutcome | null> {
    const requester = liveRequester(job);
    let answer: Result<ItemPage, AttemptFailure>;
    try {
      answer = await Result.gen(async function* () {
        const { page, tabId } = yield* Result.await(fetchItem(job, requester, signal));
        const reading = yield* readPage(page, job, clock.now());
        if (reading.kind === "item") {
          return Result.ok(
            await itemPage(page, reading.ogImage, {
              mfcItemId: job.mfcItemId,
              tabId,
              requester,
              signal,
            }),
          );
        }
        if (reading.pausedUntil !== null) {
          yield* Result.await(throttle.pauseOrHalt(reading.pausedUntil));
        }
        return await solveChallenge(job, requester, reading.status, signal);
      });
    } catch (error) {
      const { report, outcome } = defect(job);
      console.error(report, error);
      return signal.aborted ? null : outcome;
    }
    if (signal.aborted) return null;
    if (answer.isOk()) return { kind: "page", page: answer.value };
    const { error } = answer;
    if (!MfcRateLimited.is(error)) {
      console.warn(`${error._tag} for MFC item ${job.mfcItemId}: ${error.message}`);
    }
    return outcomeOf(error);
  }

  /**
   * A rate limit is booked as one, which may halt the queue. A halt was booked when it happened. Any other answer is
   * kept even when storage refuses its booking, which the throttle only logs, as it does a turn's.
   */
  async function booking(
    outcome: ItemOutcome,
    mfcItemId: number,
  ): Promise<Result<ItemOutcome, SessionStorageUnavailable>> {
    if (outcome.kind === "halted") return Result.ok(outcome);
    if (outcome.kind === "backing_off") {
      const limited = await throttle.rateLimited(outcome.until);
      return limited.map(({ haltedUntil }): ItemOutcome =>
        haltedUntil === null ? outcome : { kind: "halted", until: haltedUntil },
      );
    }
    await throttle.answered(`the answer for MFC item ${mfcItemId}`);
    return Result.ok(outcome);
  }

  /**
   * A rate limit whose booking storage refuses fails its item with that refusal, and an answer whose booking throws
   * fails it as a defect, so the run still ends.
   */
  async function booked(job: Job, outcome: ItemOutcome): Promise<ItemOutcome> {
    try {
      const written = await booking(outcome, job.mfcItemId);
      return written.match({
        ok: (kept) => kept,
        err: (failure) => {
          console.warn(`${failure._tag} for MFC item ${job.mfcItemId}: ${failure.message}`);
          return outcomeOf(failure);
        },
      });
    } catch (error) {
      const { report, outcome: failed } = defect(job);
      console.error(report, error);
      return failed;
    }
  }

  async function drain(): Promise<Result<void, SessionStorageUnavailable>> {
    for (;;) {
      dispatch({ type: "started" });
      const job = state.active;
      if (!job) break;
      const controller = new AbortController();
      current = { job, controller };
      const outcome = await attempt(job, controller.signal);
      current = null;
      if (outcome === null) continue;
      dispatch({ type: "answered", job, outcome: await booked(job, outcome) });
    }
    return Result.gen(async function* () {
      yield* Result.await(mfcTabs.release());
      yield* Result.await(pictureTab.release());
      return Result.ok();
    });
  }

  /** Where the queue's failures end: a tab it could not release, or a defect. Either is logged, and pending work restarts it. */
  function kick(): void {
    const stopped = (cause: unknown) => {
      console.error("the MFC fetch queue stopped", cause);
    };
    draining ??= (async () => {
      try {
        const drained = await drain();
        drained.tapError(stopped);
      } catch (error) {
        stopped(error);
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
    async noteTabActivated(tabId: number): Promise<Result<void, SessionStorageUnavailable>> {
      const claims = await Promise.all([mfcTabs.claim(tabId), pictureTab.claim(tabId)]);
      return Result.all(claims).andThen(() => Result.ok());
    },
    /** Runs the queue once, which closes a tab left open by a worker that stopped mid-run. */
    resume: kick,
  };
}

export type Fetcher = ReturnType<typeof createFetcher>;
