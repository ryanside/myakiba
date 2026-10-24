import { Result, panic } from "better-result";
import * as z from "zod";
import type { Clock, SessionValue } from "./clock";
import { AttemptAbandoned } from "./errors/attempt-abandoned";
import { MfcLoadTimedOut } from "./errors/mfc-load-timed-out";
import { MfcTabUnavailable } from "./errors/mfc-tab-unavailable";
import type { TabClosed } from "./errors/tab-closed";
import type { TabEditRefused } from "./errors/tab-edit-refused";
import type { TabOpenFailed } from "./errors/tab-open-failed";
import { sameContext } from "./queue";
import type { Requester, TabContext } from "./queue";
import type { Tab, Tabs } from "./tabs";
import { loading } from "./throttle";
import type { HoldTurn, Throttle, TurnFailure } from "./throttle";

/** The first run still waiting for the job. Read at each tab step, since runs cancel at any time. */
export type LiveRequester = () => Result<Requester, AttemptAbandoned>;

export const ownedTabSchema = z
  .discriminatedUnion("state", [
    z.strictObject({ state: z.literal("loading"), tabId: z.number().int() }),
    z.strictObject({ state: z.literal("landed"), tabId: z.number().int() }),
  ])
  .nullable();
export type OwnedTab = z.output<typeof ownedTabSchema>;

const POLL_MS = 50;
/** Firefox may call a tab complete on the page it showed before, for a moment before its load starts. */
const LOAD_START_MS = 2000;
/** The extension cannot stop a load in a tab the user took, so the turn waits for it, up to this long after it started. */
const CLAIMED_LOAD_MS = 2 * 60_000;

export function inContext(tab: Tab, context: TabContext): boolean {
  return (
    tab.incognito !== undefined &&
    sameContext({ incognito: tab.incognito, cookieStoreId: tab.cookieStoreId ?? null }, context)
  );
}

function onOrigin(url: string | undefined, origin: string): boolean {
  return URL.parse(url ?? "")?.origin === origin;
}

/** How the extension fails to get its own tab to show a page. */
export type TabOpenFailure =
  | MfcTabUnavailable
  | TabClosed
  | TabEditRefused
  | TabOpenFailed
  | AttemptAbandoned
  | MfcLoadTimedOut
  | TurnFailure;

/** Why a load stopped once its signal aborted: the attempt was abandoned, or the turn ran out. */
type Stopped = () => AttemptAbandoned | MfcLoadTimedOut;

type Load = {
  readonly tabId: number;
  readonly urlAtStart: string | null;
  readonly startedAt: number;
};

/**
 * A 204 or a download ends a load back on `urlAtStart`, so a load seen loading has ended once it is complete. A browser
 * hides the URL of a page outside the host permissions, so that page reads as no URL at all.
 */
function endOf({ urlAtStart, startedAt }: Load, clock: Clock): (tab: Tab) => boolean {
  let seenLoading = false;
  return (tab) => {
    if (tab.status !== "complete" || tab.pendingUrl !== undefined) {
      seenLoading = true;
      return false;
    }
    return (
      seenLoading || (tab.url ?? null) !== urlAtStart || clock.now() - startedAt >= LOAD_START_MS
    );
  };
}

export function ownedTab(deps: {
  readonly tabs: Tabs;
  readonly clock: Clock;
  readonly origin: string;
  readonly record: SessionValue<OwnedTab>;
  readonly throttle: Pick<Throttle, "load">;
  readonly turnMs: number;
}) {
  const { tabs, clock, origin, record, throttle, turnMs } = deps;
  /**
   * The record survives a worker restart, but storage answers later, so a close already waiting on it checks this too.
   * Browsers never reuse a tab id, so a claim is never cleared.
   */
  const claimed = new Set<number>();
  let ownership = Promise.resolve(null);

  async function exclusively<T>(work: () => Promise<T>): Promise<T> {
    const previous = ownership;
    const { promise: turn, resolve } = Promise.withResolvers<null>();
    ownership = turn;
    try {
      await previous;
      return await work();
    } finally {
      resolve(null);
    }
  }

  async function windowOf(tabId: number): Promise<Result<number, TabClosed>> {
    const tab = await tabs.get(tabId);
    if (tab.isErr()) return Result.err(tab.error);
    return Result.ok(
      tab.value.windowId ??
        panic(
          `Opening an MFC tab needs the run's tab to have a window, but the browser answered tab ${tabId} with no windowId.`,
        ),
    );
  }

  async function landedTab(): Promise<{ readonly tabId: number; readonly tab: Tab } | null> {
    const own = await record.load();
    if (own?.state !== "landed") return null;
    const tab = await tabs.get(own.tabId);
    if (tab.isOk()) return claimed.has(own.tabId) ? null : { tabId: own.tabId, tab: tab.value };
    await record.save(null);
    return null;
  }

  async function stillOursAfterRemoving(tabId: number): Promise<boolean> {
    const own = await record.load();
    if (own?.tabId !== tabId || claimed.has(tabId)) return false;
    await tabs.remove(tabId);
    const left = await tabs.get(tabId);
    if (left.isOk()) return true;
    await record.save(null);
    return false;
  }

  /**
   * Chrome refuses to close a tab while the user drags it, and the drag may claim it before the next try. Whether the
   * tab is gone, not whether the removal was refused, decides another try.
   */
  async function closeUntilGone(tabId: number): Promise<void> {
    while (await exclusively(() => stillOursAfterRemoving(tabId))) await clock.sleep(POLL_MS);
  }

  async function release(): Promise<void> {
    const own = await record.load();
    if (own) await closeUntilGone(own.tabId);
  }

  function navigateUnlessShown(
    requester: LiveRequester,
    url: string,
    signal: AbortSignal,
    stopped: Stopped,
  ): Promise<Result<Load | null, TabOpenFailure>> {
    return Result.gen(async function* () {
      const { tabId: requesterTabId, context } = yield* requester();
      const windowId = yield* Result.await(windowOf(requesterTabId));
      return await exclusively(async (): Promise<Result<Load | null, TabOpenFailure>> => {
        const own = await landedTab();
        if (!own || !inContext(own.tab, context) || own.tab.windowId !== windowId) {
          return Result.ok(null);
        }
        const load = { tabId: own.tabId, urlAtStart: own.tab.url ?? null, startedAt: clock.now() };
        if (own.tab.url === url) return Result.ok(load);
        if (signal.aborted) return Result.err(stopped());
        const navigated = await tabs.update(own.tabId, { url });
        if (navigated.isErr()) return Result.err(navigated.error);
        await record.save({ state: "loading", tabId: own.tabId });
        return Result.ok(load);
      });
    });
  }

  async function create(
    requester: LiveRequester,
    url: string,
    signal: AbortSignal,
    stopped: Stopped,
  ): Promise<Result<Load, TabOpenFailure>> {
    await release();
    return Result.gen(async function* () {
      const { tabId: requesterTabId, context } = yield* requester();
      const windowId = yield* Result.await(windowOf(requesterTabId));
      const properties: Parameters<Tabs["create"]>[0] = { url, active: false, windowId };
      if (context.cookieStoreId !== null) properties.cookieStoreId = context.cookieStoreId;
      if (signal.aborted) return Result.err(stopped());
      const startedAt = clock.now();
      const created = yield* Result.await(tabs.create(properties));
      const tabId =
        created.id ??
        panic(
          `Opening an MFC tab needs the new tab to have an id, but the browser created one in window ${windowId} with no id.`,
        );
      await exclusively(async () => {
        if (!claimed.has(tabId)) await record.save({ state: "loading", tabId });
      });
      return Result.ok({ tabId, urlAtStart: null, startedAt });
    });
  }

  async function landed(
    { tabId, urlAtStart }: Load,
    ended: (tab: Tab) => boolean,
  ): Promise<Result<boolean, MfcTabUnavailable>> {
    const own = await record.load();
    if (own?.tabId !== tabId || claimed.has(tabId)) {
      return Result.err(new MfcTabUnavailable({ tabId, reason: "taken" }));
    }
    if (own.state === "landed") return Result.ok(true);
    const shown = await tabs.get(tabId);
    if (shown.isErr()) return Result.err(new MfcTabUnavailable({ tabId, reason: "closed" }));
    const tab = shown.value;
    if (!ended(tab)) return Result.ok(false);
    if (!onOrigin(tab.url, origin)) {
      return Result.err(new MfcTabUnavailable({ tabId, reason: "left_origin" }));
    }
    if ((tab.url ?? null) === urlAtStart) {
      return Result.err(new MfcTabUnavailable({ tabId, reason: "ended_at_start" }));
    }
    await record.save({ state: "landed", tabId });
    return Result.ok(true);
  }

  async function untilLanded(
    load: Load,
    ended: (tab: Tab) => boolean,
    signal: AbortSignal,
    stopped: Stopped,
  ): Promise<Result<number, TabOpenFailure>> {
    for (;;) {
      if (signal.aborted) return Result.err(stopped());
      const shown = await exclusively(() => landed(load, ended));
      if (shown.isErr()) return Result.err(shown.error);
      if (shown.value) return Result.ok(load.tabId);
      await clock.sleep(POLL_MS, signal);
    }
  }

  async function holdTurnUntilLoadEnds(
    { tabId, startedAt }: Load,
    ended: (tab: Tab) => boolean,
    holdUntil: HoldTurn,
  ): Promise<void> {
    const until = startedAt + CLAIMED_LOAD_MS;
    const stillLoading = async () => {
      const tab = await tabs.get(tabId);
      return tab.isOk() && !ended(tab.value);
    };
    if (!(await stillLoading())) return;
    await holdUntil(until);
    while (clock.now() < until && (await stillLoading())) await clock.sleep(POLL_MS);
  }

  async function open(
    requester: LiveRequester,
    url: string,
    cancel: AbortSignal,
    timeout: AbortSignal,
    holdUntil: HoldTurn,
  ): Promise<Result<number, TabOpenFailure>> {
    const signal = AbortSignal.any([cancel, timeout]);
    const stopped: Stopped = () =>
      cancel.aborted
        ? new AttemptAbandoned()
        : new MfcLoadTimedOut({ timeoutMs: turnMs, phase: "tab" });
    const shown = await navigateUnlessShown(requester, url, signal, stopped);
    if (shown.isErr()) return Result.err(shown.error);
    const started =
      shown.value === null ? await create(requester, url, signal, stopped) : Result.ok(shown.value);
    if (started.isErr()) return Result.err(started.error);
    const load = started.value;
    const ended = endOf(load, clock);
    const opened = await untilLanded(load, ended, signal, stopped);
    if (opened.isErr()) {
      await closeUntilGone(load.tabId);
      await holdTurnUntilLoadEnds(load, ended, holdUntil);
    }
    return opened;
  }

  return {
    async load(
      requester: LiveRequester,
      url: string,
      signal: AbortSignal,
    ): Promise<Result<number, TabOpenFailure>> {
      const turn = await loading(
        () =>
          throttle.load(
            signal,
            (timeout, holdUntil) => open(requester, url, signal, timeout, holdUntil),
            turnMs,
          ),
        signal,
        "tab",
      );
      return Result.flatten(turn);
    },

    async loadAndRead<T, E>(
      requester: LiveRequester,
      url: string,
      signal: AbortSignal,
      read: (tabId: number, signal: AbortSignal) => Promise<Result<T, E>>,
    ): Promise<Result<T, E | TabOpenFailure>> {
      const turn = await loading(
        () =>
          throttle.load(
            signal,
            async (timeout, holdUntil): Promise<Result<T, E | TabOpenFailure>> => {
              const opened = await open(requester, url, signal, timeout, holdUntil);
              if (opened.isErr()) return Result.err(opened.error);
              return read(opened.value, AbortSignal.any([signal, timeout]));
            },
            turnMs,
          ),
        signal,
        "tab",
      );
      return Result.flatten(turn);
    },

    async landedIn(context: TabContext): Promise<number | null> {
      const own = await exclusively(landedTab);
      return own && inContext(own.tab, context) && onOrigin(own.tab.url, origin) ? own.tabId : null;
    },

    async claim(tabId: number): Promise<void> {
      claimed.add(tabId);
      await exclusively(async () => {
        const own = await record.load();
        if (own?.tabId === tabId) await record.save(null);
      });
    },

    release,
  };
}
