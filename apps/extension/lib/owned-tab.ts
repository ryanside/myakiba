import * as z from "zod";
import type { Clock, SessionValue } from "./clock";
import { sameContext } from "./queue";
import type { Requester, TabContext } from "./queue";
import type { HoldTurn, Throttle } from "./throttle";

export type Tab = {
  readonly id?: number;
  readonly windowId?: number;
  readonly status?: string;
  readonly url?: string;
  readonly pendingUrl?: string;
  readonly title?: string;
  readonly active?: boolean;
  readonly incognito?: boolean;
  readonly cookieStoreId?: string;
};

export type TabsApi = {
  readonly get: (tabId: number) => Promise<Tab>;
  readonly query: (query: { url: string; status: "complete"; discarded: false }) => Promise<Tab[]>;
  readonly create: (properties: {
    url: string;
    active: boolean;
    windowId: number;
    cookieStoreId?: string;
  }) => Promise<Tab>;
  readonly update: (
    tabId: number,
    properties: { url?: string; active?: boolean },
  ) => Promise<Tab | undefined>;
  readonly remove: (tabId: number) => Promise<void>;
};

/** The first run still waiting for the job. Read at each tab step, since runs cancel at any time. */
export type LiveRequester = () => Requester;

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

/** The extension gave up its tab, because the user took it or its load ended on another page. */
export class TabUnavailableError extends Error {
  readonly tabId: number;
  readonly reason: "taken" | "ended_elsewhere";

  constructor(tabId: number, reason: "taken" | "ended_elsewhere") {
    super(
      reason === "taken"
        ? `the user took tab ${tabId}`
        : `the load in tab ${tabId} ended on another page`,
    );
    this.name = "TabUnavailableError";
    this.tabId = tabId;
    this.reason = reason;
  }
}

export function inContext(tab: Tab, context: TabContext): boolean {
  return (
    tab.incognito !== undefined &&
    sameContext({ incognito: tab.incognito, cookieStoreId: tab.cookieStoreId ?? null }, context)
  );
}

function onOrigin(url: string | undefined, origin: string): boolean {
  return URL.parse(url ?? "")?.origin === origin;
}

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
  readonly tabs: TabsApi;
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

  async function windowOf(tabId: number): Promise<number> {
    const { windowId } = await tabs.get(tabId);
    if (windowId === undefined) throw new Error(`tab ${tabId} has no window`);
    return windowId;
  }

  async function landedTab(): Promise<{ readonly tabId: number; readonly tab: Tab } | null> {
    const own = await record.load();
    if (own?.state !== "landed") return null;
    const tab = await tabs.get(own.tabId).catch(() => null);
    if (tab) return claimed.has(own.tabId) ? null : { tabId: own.tabId, tab };
    await record.save(null);
    return null;
  }

  async function stillOursAfterRemoving(tabId: number): Promise<boolean> {
    const own = await record.load();
    if (own?.tabId !== tabId || claimed.has(tabId)) return false;
    await tabs.remove(tabId).catch(() => null);
    if ((await tabs.get(tabId).catch(() => null)) !== null) return true;
    await record.save(null);
    return false;
  }

  /** Chrome refuses to close a tab while the user drags it, and the drag may claim it before the next try. */
  async function closeUntilGone(tabId: number): Promise<void> {
    while (await exclusively(() => stillOursAfterRemoving(tabId))) await clock.sleep(POLL_MS);
  }

  async function release(): Promise<void> {
    const own = await record.load();
    if (own) await closeUntilGone(own.tabId);
  }

  async function navigateUnlessShown(
    requester: LiveRequester,
    url: string,
    signal: AbortSignal,
  ): Promise<Load | null> {
    const { tabId: requesterTabId, context } = requester();
    const windowId = await windowOf(requesterTabId);
    return exclusively(async () => {
      const own = await landedTab();
      if (!own || !inContext(own.tab, context) || own.tab.windowId !== windowId) return null;
      const load = { tabId: own.tabId, urlAtStart: own.tab.url ?? null, startedAt: clock.now() };
      if (own.tab.url === url) return load;
      signal.throwIfAborted();
      await tabs.update(own.tabId, { url });
      await record.save({ state: "loading", tabId: own.tabId });
      return load;
    });
  }

  async function create(requester: LiveRequester, url: string, signal: AbortSignal): Promise<Load> {
    await release();
    const { tabId: requesterTabId, context } = requester();
    const windowId = await windowOf(requesterTabId);
    const properties: Parameters<TabsApi["create"]>[0] = { url, active: false, windowId };
    if (context.cookieStoreId !== null) properties.cookieStoreId = context.cookieStoreId;
    signal.throwIfAborted();
    const startedAt = clock.now();
    const { id: tabId } = await tabs.create(properties);
    if (tabId === undefined) throw new Error("the new tab has no id");
    await exclusively(async () => {
      if (!claimed.has(tabId)) await record.save({ state: "loading", tabId });
    });
    return { tabId, urlAtStart: null, startedAt };
  }

  async function landed(
    { tabId, urlAtStart }: Load,
    ended: (tab: Tab) => boolean,
  ): Promise<boolean> {
    const own = await record.load();
    if (own?.tabId !== tabId || claimed.has(tabId)) throw new TabUnavailableError(tabId, "taken");
    if (own.state === "landed") return true;
    const tab = await tabs.get(tabId);
    if (!ended(tab)) return false;
    if (!onOrigin(tab.url, origin) || (tab.url ?? null) === urlAtStart) {
      throw new TabUnavailableError(tabId, "ended_elsewhere");
    }
    await record.save({ state: "landed", tabId });
    return true;
  }

  async function holdTurnUntilLoadEnds(
    { tabId, startedAt }: Load,
    ended: (tab: Tab) => boolean,
    holdUntil: HoldTurn,
  ): Promise<void> {
    const until = startedAt + CLAIMED_LOAD_MS;
    const loading = async () => {
      const tab = await tabs.get(tabId).catch(() => null);
      return tab !== null && !ended(tab);
    };
    if (!(await loading())) return;
    await holdUntil(until);
    while (clock.now() < until && (await loading())) await clock.sleep(POLL_MS);
  }

  async function open(
    requester: LiveRequester,
    url: string,
    cancel: AbortSignal,
    timeout: AbortSignal,
    holdUntil: HoldTurn,
  ): Promise<number> {
    const signal = AbortSignal.any([cancel, timeout]);
    const load =
      (await navigateUnlessShown(requester, url, signal)) ?? (await create(requester, url, signal));
    const ended = endOf(load, clock);
    try {
      for (;;) {
        signal.throwIfAborted();
        if (await exclusively(() => landed(load, ended))) return load.tabId;
        await clock.sleep(POLL_MS, signal);
      }
    } catch (error) {
      await closeUntilGone(load.tabId);
      await holdTurnUntilLoadEnds(load, ended, holdUntil);
      throw error;
    }
  }

  return {
    load(requester: LiveRequester, url: string, signal: AbortSignal): Promise<number> {
      return throttle.load(
        signal,
        (timeout, holdUntil) => open(requester, url, signal, timeout, holdUntil),
        turnMs,
      );
    },

    loadAndRead<T>(
      requester: LiveRequester,
      url: string,
      signal: AbortSignal,
      read: (tabId: number, signal: AbortSignal) => Promise<T>,
    ): Promise<T> {
      return throttle.load(
        signal,
        async (timeout, holdUntil) =>
          read(
            await open(requester, url, signal, timeout, holdUntil),
            AbortSignal.any([signal, timeout]),
          ),
        turnMs,
      );
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
