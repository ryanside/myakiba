import { Result, panic } from "better-result";
import * as z from "zod";
import type { Clock } from "./clock";
import { AttemptAbandoned } from "./errors/attempt-abandoned";
import { MfcLoadTimedOut } from "./errors/mfc-load-timed-out";
import { MfcTabUnavailable } from "./errors/mfc-tab-unavailable";
import type { SessionStorageUnavailable } from "./errors/session-storage-unavailable";
import type { TabClosed } from "./errors/tab-closed";
import type { TabEditRefused } from "./errors/tab-edit-refused";
import type { TabOpenFailed } from "./errors/tab-open-failed";
import { sameContext } from "./queue";
import type { Requester, TabContext } from "./queue";
import { remembered } from "./session-value";
import type { SessionValue } from "./session-value";
import type { Tab, Tabs } from "./tabs";
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
  | SessionStorageUnavailable
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
  const { tabs, clock, origin, throttle, turnMs } = deps;
  const record = remembered(deps.record, null);
  /**
   * A claim clears the record, but a step that awaited the browser meanwhile checks this before it writes the record or
   * touches the tab. Browsers never reuse a tab id, so a claim is never cleared.
   */
  const claimed = new Set<number>();

  const ours = (tabId: number) => record.get()?.tabId === tabId && !claimed.has(tabId);

  /** Forgets a tab that is gone, unless the record moved on while the browser answered. */
  async function forget(tabId: number): Promise<Result<void, SessionStorageUnavailable>> {
    return record.get()?.tabId === tabId ? record.set(null) : Result.ok();
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

  async function landedTab(): Promise<
    Result<{ readonly tabId: number; readonly tab: Tab } | null, SessionStorageUnavailable>
  > {
    const own = record.get();
    if (own?.state !== "landed" || !ours(own.tabId)) return Result.ok(null);
    const tab = await tabs.get(own.tabId);
    if (tab.isOk()) return Result.ok(ours(own.tabId) ? { tabId: own.tabId, tab: tab.value } : null);
    const forgotten = await forget(own.tabId);
    return forgotten.map(() => null);
  }

  async function stillOursAfterRemoving(
    tabId: number,
  ): Promise<Result<boolean, SessionStorageUnavailable>> {
    if (!ours(tabId)) return Result.ok(false);
    await tabs.remove(tabId);
    const left = await tabs.get(tabId);
    if (left.isOk()) return Result.ok(true);
    const forgotten = await forget(tabId);
    return forgotten.map(() => false);
  }

  /**
   * Chrome refuses to close a tab while the user drags it, and the drag may claim it before the next try. Whether the
   * tab is gone, not whether the removal was refused, decides another try.
   */
  async function closeUntilGone(tabId: number): Promise<Result<void, SessionStorageUnavailable>> {
    for (;;) {
      const left = await stillOursAfterRemoving(tabId);
      if (left.isErr()) return Result.err(left.error);
      if (!left.value) return Result.ok();
      await clock.sleep(POLL_MS);
    }
  }

  async function release(): Promise<Result<void, SessionStorageUnavailable>> {
    await record.ready();
    const own = record.get();
    return own ? closeUntilGone(own.tabId) : Result.ok();
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
      const own = yield* Result.await(landedTab());
      if (!own || !inContext(own.tab, context) || own.tab.windowId !== windowId) {
        return Result.ok(null);
      }
      const load = { tabId: own.tabId, urlAtStart: own.tab.url ?? null, startedAt: clock.now() };
      if (own.tab.url === url) return Result.ok(load);
      if (signal.aborted) return Result.err(stopped());
      yield* Result.await(tabs.update(own.tabId, { url }));
      if (!claimed.has(own.tabId)) {
        yield* Result.await(record.set({ state: "loading", tabId: own.tabId }));
      }
      return Result.ok(load);
    });
  }

  function create(
    requester: LiveRequester,
    url: string,
    signal: AbortSignal,
    stopped: Stopped,
  ): Promise<Result<Load, TabOpenFailure>> {
    return Result.gen(async function* () {
      yield* Result.await(release());
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
      if (!claimed.has(tabId)) yield* Result.await(record.set({ state: "loading", tabId }));
      return Result.ok({ tabId, urlAtStart: null, startedAt });
    });
  }

  async function landed(
    { tabId, urlAtStart }: Load,
    ended: (tab: Tab) => boolean,
  ): Promise<Result<boolean, MfcTabUnavailable | SessionStorageUnavailable>> {
    const taken = () => Result.err(new MfcTabUnavailable({ tabId, reason: "taken" }));
    if (!ours(tabId)) return taken();
    if (record.get()?.state === "landed") return Result.ok(true);
    const shown = await tabs.get(tabId);
    if (!ours(tabId)) return taken();
    if (shown.isErr()) return Result.err(new MfcTabUnavailable({ tabId, reason: "closed" }));
    const tab = shown.value;
    if (!ended(tab)) return Result.ok(false);
    if (!onOrigin(tab.url, origin)) {
      return Result.err(new MfcTabUnavailable({ tabId, reason: "left_origin" }));
    }
    if ((tab.url ?? null) === urlAtStart) {
      return Result.err(new MfcTabUnavailable({ tabId, reason: "ended_at_start" }));
    }
    const saved = await record.set({ state: "landed", tabId });
    return saved.map(() => true);
  }

  async function untilLanded(
    load: Load,
    ended: (tab: Tab) => boolean,
    signal: AbortSignal,
    stopped: Stopped,
  ): Promise<Result<number, TabOpenFailure>> {
    for (;;) {
      if (signal.aborted) return Result.err(stopped());
      const shown = await landed(load, ended);
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

  /** A load that fails is closed and keeps the turn until it ends. A failure to do so replaces the load's own. */
  async function open(
    requester: LiveRequester,
    url: string,
    cancel: AbortSignal,
    timeout: AbortSignal,
    holdUntil: HoldTurn,
  ): Promise<Result<number, TabOpenFailure>> {
    await record.ready();
    const signal = AbortSignal.any([cancel, timeout]);
    const stopped: Stopped = () =>
      cancel.aborted ? new AttemptAbandoned() : new MfcLoadTimedOut({ timeoutMs: turnMs });
    const shown = await navigateUnlessShown(requester, url, signal, stopped);
    if (shown.isErr()) return Result.err(shown.error);
    const started =
      shown.value === null ? await create(requester, url, signal, stopped) : Result.ok(shown.value);
    if (started.isErr()) return Result.err(started.error);
    const load = started.value;
    const ended = endOf(load, clock);
    const opened = await untilLanded(load, ended, signal, stopped);
    if (opened.isOk()) return opened;
    const closed = await closeUntilGone(load.tabId);
    if (closed.isErr()) return Result.err(closed.error);
    await holdTurnUntilLoadEnds(load, ended, holdUntil);
    return opened;
  }

  return {
    load(
      requester: LiveRequester,
      url: string,
      signal: AbortSignal,
    ): Promise<Result<number, TabOpenFailure>> {
      return throttle.load(
        signal,
        (timeout, holdUntil) => open(requester, url, signal, timeout, holdUntil),
        turnMs,
      );
    },

    loadAndRead<T, E>(
      requester: LiveRequester,
      url: string,
      signal: AbortSignal,
      read: (tabId: number, signal: AbortSignal) => Promise<Result<T, E>>,
    ): Promise<Result<T, E | TabOpenFailure>> {
      return throttle.load(
        signal,
        async (timeout, holdUntil): Promise<Result<T, E | TabOpenFailure>> => {
          const opened = await open(requester, url, signal, timeout, holdUntil);
          if (opened.isErr()) return Result.err(opened.error);
          return read(opened.value, AbortSignal.any([signal, timeout]));
        },
        turnMs,
      );
    },

    async landedIn(context: TabContext): Promise<Result<number | null, SessionStorageUnavailable>> {
      await record.ready();
      const own = await landedTab();
      return own.map((found) =>
        found && inContext(found.tab, context) && onOrigin(found.tab.url, origin)
          ? found.tabId
          : null,
      );
    },

    async claim(tabId: number): Promise<Result<void, SessionStorageUnavailable>> {
      claimed.add(tabId);
      await record.ready();
      return forget(tabId);
    },

    release,
  };
}
