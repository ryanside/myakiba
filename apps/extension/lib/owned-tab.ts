import * as z from "zod";
import type { Clock, SessionValue } from "./clock";
import { sameContext } from "./queue";
import type { Requester, TabContext } from "./queue";
import type { Throttle } from "./throttle";

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

/** Firefox may call a tab complete on `before`, the page it showed when the load started, before the load begins. */
export const ownedTabSchema = z
  .discriminatedUnion("state", [
    z.strictObject({
      state: z.literal("loading"),
      tabId: z.number().int(),
      before: z.string().nullable(),
    }),
    z.strictObject({ state: z.literal("landed"), tabId: z.number().int() }),
  ])
  .nullable();
export type OwnedTab = z.output<typeof ownedTabSchema>;

const POLL_MS = 50;

class TabTakenError extends Error {
  constructor(tabId: number) {
    super(`the user took tab ${tabId}`);
    this.name = "TabTakenError";
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

type Load = { readonly tabId: number; readonly before: string | null };

/** A browser hides the URL of a page outside the host permissions, so that page reads as no URL at all. */
function hasEnded(tab: Tab, before: string | null): boolean {
  return tab.status === "complete" && tab.pendingUrl === undefined && (tab.url ?? null) !== before;
}

function hasLanded(tab: Tab, before: string | null, origin: string): boolean {
  return hasEnded(tab, before) && onOrigin(tab.url, origin);
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
   * Every tab focused since this worker started, held in memory as well as cleared from the record, so a focus wins
   * over a close or a navigation already waiting on storage. Tab ids are never reused, and a claim is for good.
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
      const load = { tabId: own.tabId, before: own.tab.url ?? null };
      if (own.tab.url === url) return load;
      signal.throwIfAborted();
      await tabs.update(own.tabId, { url });
      await record.save({ state: "loading", ...load });
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
    const { id: tabId } = await tabs.create(properties);
    if (tabId === undefined) throw new Error("the new tab has no id");
    const load = { tabId, before: null };
    await exclusively(async () => {
      if (!claimed.has(tabId)) await record.save({ state: "loading", ...load });
    });
    return load;
  }

  async function landed(tabId: number): Promise<boolean> {
    const own = await record.load();
    if (own?.tabId !== tabId || claimed.has(tabId)) throw new TabTakenError(tabId);
    if (own.state === "landed") return true;
    if (!hasLanded(await tabs.get(tabId), own.before, origin)) return false;
    await record.save({ state: "landed", tabId });
    return true;
  }

  async function holdTurnUntilLoadEnds(
    { tabId, before }: Load,
    timeout: AbortSignal,
  ): Promise<void> {
    let loading = false;
    while (!timeout.aborted) {
      const tab = await tabs.get(tabId).catch(() => null);
      if (!tab) return;
      if (tab.status !== "complete" || tab.pendingUrl !== undefined) loading = true;
      else if (loading || hasEnded(tab, before)) return;
      await clock.sleep(POLL_MS, timeout);
    }
  }

  async function open(
    requester: LiveRequester,
    url: string,
    cancel: AbortSignal,
    timeout: AbortSignal,
  ): Promise<number> {
    const signal = AbortSignal.any([cancel, timeout]);
    const load =
      (await navigateUnlessShown(requester, url, signal)) ?? (await create(requester, url, signal));
    try {
      for (;;) {
        signal.throwIfAborted();
        if (await exclusively(() => landed(load.tabId))) return load.tabId;
        await clock.sleep(POLL_MS, signal);
      }
    } catch (error) {
      if (signal.aborted) await closeUntilGone(load.tabId);
      await holdTurnUntilLoadEnds(load, timeout);
      throw error;
    }
  }

  return {
    load(requester: LiveRequester, url: string, signal: AbortSignal): Promise<number> {
      return throttle.load(signal, (timeout) => open(requester, url, signal, timeout), turnMs);
    },

    loadAndRead<T>(
      requester: LiveRequester,
      url: string,
      signal: AbortSignal,
      read: (tabId: number, signal: AbortSignal) => Promise<T>,
    ): Promise<T> {
      return throttle.load(
        signal,
        async (timeout) =>
          read(await open(requester, url, signal, timeout), AbortSignal.any([signal, timeout])),
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
