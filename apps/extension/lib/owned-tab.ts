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

/**
 * A tab the extension created, kept until the user claims it or it is gone. While its load runs, `before` is the page the
 * tab showed when the load started, which Firefox may still call complete before the load begins.
 */
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

/** A load the extension started in a tab, and the page the tab showed when it started. */
type Load = { readonly tabId: number; readonly before: string | null };

/**
 * The load has ended once the tab is complete on a page other than the one it showed before. A browser hides the URL of
 * a page outside the host permissions, so that page reads as no URL at all.
 */
function hasEnded(tab: Tab, before: string | null): boolean {
  return tab.status === "complete" && tab.pendingUrl === undefined && (tab.url ?? null) !== before;
}

/** A load that ends anywhere but on `origin`, such as a redirect away, a 204 or a download, never lands. */
function hasLanded(tab: Tab, before: string | null, origin: string): boolean {
  return hasEnded(tab, before) && onOrigin(tab.url, origin);
}

/**
 * The one tab on `origin` the extension created and the user has not claimed, which it loads pages in and closes. Only two
 * events end the extension's ownership: the user focuses the tab, or the extension shows it to them. A URL never does.
 */
export function ownedTab(deps: {
  readonly tabs: TabsApi;
  readonly clock: Clock;
  readonly origin: string;
  readonly record: SessionValue<OwnedTab>;
  readonly throttle: Pick<Throttle, "load">;
  /** How long one throttle turn in this tab may take, from when the turn begins. */
  readonly turnMs: number;
}) {
  const { tabs, clock, origin, record, throttle, turnMs } = deps;
  /** Tabs the user focused while a create was pending, which may include the new tab. */
  let focusedDuringCreate: Set<number> | null = null;
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
    if (tab) return { tabId: own.tabId, tab };
    await record.save(null);
    return null;
  }

  /** Answers whether the tab is still open and still the extension's after one try at removing it. */
  async function removeOnce(tabId: number): Promise<boolean> {
    const own = await record.load();
    if (own?.tabId !== tabId) return false;
    await tabs.remove(tabId).catch(() => null);
    if ((await tabs.get(tabId).catch(() => null)) !== null) return true;
    await record.save(null);
    return false;
  }

  /** Chrome refuses to close a tab while the user drags it, and the drag may claim it before the next try. */
  async function closeUntilGone(tabId: number): Promise<void> {
    while (await exclusively(() => removeOnce(tabId))) await clock.sleep(POLL_MS);
  }

  async function release(): Promise<void> {
    const own = await record.load();
    if (own) await closeUntilGone(own.tabId);
  }

  /** A tab that already shows `url` is used as it is, since a load of the page it shows could not be told from that page. */
  async function navigate(
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

  /** A new tab's only page before its load is a blank one. */
  async function create(requester: LiveRequester, url: string, signal: AbortSignal): Promise<Load> {
    await release();
    const { tabId: requesterTabId, context } = requester();
    const windowId = await windowOf(requesterTabId);
    const properties: Parameters<TabsApi["create"]>[0] = { url, active: false, windowId };
    if (context.cookieStoreId !== null) properties.cookieStoreId = context.cookieStoreId;
    signal.throwIfAborted();
    const focused = new Set<number>();
    focusedDuringCreate = focused;
    let created: Tab;
    try {
      created = await tabs.create(properties);
    } finally {
      focusedDuringCreate = null;
    }
    const tabId = created.id;
    if (tabId === undefined) throw new Error("the new tab has no id");
    const load = { tabId, before: null };
    await exclusively(async () => {
      if (!focused.has(tabId)) await record.save({ state: "loading", ...load });
    });
    return load;
  }

  async function landed(tabId: number): Promise<boolean> {
    const own = await record.load();
    if (own?.tabId !== tabId) throw new TabTakenError(tabId);
    if (own.state === "landed") return true;
    if (!hasLanded(await tabs.get(tabId), own.before, origin)) return false;
    await record.save({ state: "landed", tabId });
    return true;
  }

  /**
   * A tab the user claimed mid-load may still run the extension's request, so the turn waits until the tab is seen
   * loading and then complete, which is also when a load of the user's own has replaced it.
   */
  async function untilEnded({ tabId, before }: Load, timeout: AbortSignal): Promise<void> {
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
    const load = (await navigate(requester, url, signal)) ?? (await create(requester, url, signal));
    try {
      for (;;) {
        signal.throwIfAborted();
        if (await exclusively(() => landed(load.tabId))) return load.tabId;
        await clock.sleep(POLL_MS, signal);
      }
    } catch (error) {
      if (signal.aborted) await closeUntilGone(load.tabId);
      await untilEnded(load, timeout);
      throw error;
    }
  }

  return {
    /**
     * Loads `url` in the extension's own tab in one throttle turn. A load cut short closes the tab before the turn ends,
     * unless the user claimed it.
     */
    load(requester: LiveRequester, url: string, signal: AbortSignal): Promise<number> {
      return throttle.load(signal, (timeout) => open(requester, url, signal, timeout), turnMs);
    },

    /** Loads `url` and runs `read` in the tab, both in one throttle turn, so the next load waits for the whole of it. */
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

    closeUntilGone,

    /** The user focused the tab, or the extension showed it to them, so it is theirs from now on. */
    async claim(tabId: number): Promise<void> {
      focusedDuringCreate?.add(tabId);
      await exclusively(async () => {
        const own = await record.load();
        if (own?.tabId === tabId) await record.save(null);
      });
    },

    release,
  };
}
