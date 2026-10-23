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
 * A user's tab is never recorded. While it loads, `before` is the page the tab showed when the load started, and
 * `showsPending` says whether the browser showed the load as `pendingUrl`, as Chrome does and Firefox does not.
 */
export const ownedTabSchema = z
  .discriminatedUnion("state", [
    z.strictObject({
      state: z.literal("loading"),
      tabId: z.number().int(),
      path: z.string(),
      before: z.string().nullable(),
      showsPending: z.boolean(),
    }),
    z.strictObject({ state: z.literal("landed"), tabId: z.number().int(), path: z.string() }),
  ])
  .nullable();
export type OwnedTab = z.output<typeof ownedTabSchema>;
type Owned = NonNullable<OwnedTab>;

type Place =
  | { readonly kind: "loading" }
  | { readonly kind: "landed"; readonly path: string }
  | { readonly kind: "elsewhere" };

const LOADING: Place = { kind: "loading" };
const ELSEWHERE: Place = { kind: "elsewhere" };
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

function pathOn(origin: string, url: string | undefined | null): string | null {
  const parsed = URL.parse(url ?? "");
  return parsed?.origin === origin ? parsed.pathname : null;
}

/**
 * Only a page the extension can read on its origin counts as its own, since the browser hides the URL of a page
 * outside its host permissions. Before a load lands, a redirect within the origin is still the extension's.
 */
function locate(tab: Tab, own: Owned, origin: string): Place {
  const path = pathOn(origin, tab.pendingUrl ?? tab.url);
  if (own.state === "landed") return path === own.path ? { kind: "landed", path } : ELSEWHERE;
  const unchanged =
    tab.pendingUrl === undefined &&
    (tab.url ?? null) === own.before &&
    pathOn(origin, own.before) !== own.path;
  if (unchanged) {
    // Chrome hides a pending load only where the extension has no permission, so that load is not the extension's.
    if (own.showsPending) return ELSEWHERE;
    // Firefox shows the old page until the load commits, and may call a navigated tab complete before the load starts.
    if (tab.status !== "complete" || own.before !== null) return LOADING;
  }
  if (path === null) return ELSEWHERE;
  return tab.status === "complete" ? { kind: "landed", path } : LOADING;
}

/**
 * One tab of the extension's own on `origin`, which it loads pages in and closes only while the browser shows it is
 * still the extension's.
 */
export function ownedTab(deps: {
  readonly tabs: TabsApi;
  readonly clock: Clock;
  readonly origin: string;
  readonly record: SessionValue<OwnedTab>;
  readonly throttle: Pick<Throttle, "load">;
}) {
  const { tabs, clock, origin, record, throttle } = deps;
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
    if (tab && locate(tab, own, origin).kind === "landed") return { tabId: own.tabId, tab };
    await record.save(null);
    return null;
  }

  async function closeUntilGone(tabId: number): Promise<void> {
    const ours = await exclusively(async () => {
      const own = await record.load();
      if (own?.tabId !== tabId) return false;
      await record.save(null);
      const tab = await tabs.get(tabId).catch(() => null);
      return tab !== null && locate(tab, own, origin).kind !== "elsewhere";
    });
    if (!ours) return;
    // Chrome refuses to close a tab while the user drags it.
    while ((await tabs.get(tabId).catch(() => null)) !== null) {
      await tabs.remove(tabId).catch(() => clock.sleep(POLL_MS));
    }
  }

  async function release(): Promise<void> {
    const own = await record.load();
    if (own) await closeUntilGone(own.tabId);
  }

  async function navigate(
    requester: LiveRequester,
    url: string,
    signal: AbortSignal,
  ): Promise<number | null> {
    const { tabId: requesterTabId, context } = requester();
    const windowId = await windowOf(requesterTabId);
    return exclusively(async () => {
      const own = await landedTab();
      if (!own || !inContext(own.tab, context) || own.tab.windowId !== windowId) return null;
      signal.throwIfAborted();
      const shown = await tabs.update(own.tabId, { url });
      await record.save({
        state: "loading",
        tabId: own.tabId,
        path: new URL(url).pathname,
        before: own.tab.url ?? null,
        showsPending: shown?.pendingUrl !== undefined,
      });
      return own.tabId;
    });
  }

  async function create(requester: LiveRequester, url: string, signal: AbortSignal) {
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
    await exclusively(async () => {
      if (focused.has(tabId)) throw new TabTakenError(tabId);
      await record.save({
        state: "loading",
        tabId,
        path: new URL(url).pathname,
        before: created.url ?? null,
        showsPending: created.pendingUrl !== undefined,
      });
    });
    return tabId;
  }

  async function landed(tabId: number): Promise<boolean> {
    const own = await record.load();
    if (own?.tabId !== tabId) throw new TabTakenError(tabId);
    const place = locate(await tabs.get(tabId), own, origin);
    switch (place.kind) {
      case "loading":
        return false;
      case "landed":
        await record.save({ state: "landed", tabId, path: place.path });
        return true;
      case "elsewhere":
        await record.save(null);
        throw new TabTakenError(tabId);
    }
  }

  async function open(requester: LiveRequester, url: string, signal: AbortSignal) {
    const tabId =
      (await navigate(requester, url, signal)) ?? (await create(requester, url, signal));
    try {
      for (;;) {
        signal.throwIfAborted();
        if (await exclusively(() => landed(tabId))) return tabId;
        await clock.sleep(POLL_MS, signal);
      }
    } catch (error) {
      if (signal.aborted) await closeUntilGone(tabId);
      throw error;
    }
  }

  return {
    /**
     * Loads `url` in the extension's own tab and runs `use` there, both in one throttle turn, so the next load waits for
     * the whole of it. A load cut short closes the tab, if it is still the extension's, before the turn ends.
     */
    loadOwned<T>(
      requester: LiveRequester,
      url: string,
      signal: AbortSignal,
      use: (tabId: number, signal: AbortSignal) => T | Promise<T>,
    ): Promise<T> {
      return throttle.load(signal, async (timeout) => {
        const bounded = AbortSignal.any([signal, timeout]);
        return use(await open(requester, url, bounded), bounded);
      });
    },

    async landedIn(context: TabContext): Promise<number | null> {
      const own = await exclusively(landedTab);
      return own && inContext(own.tab, context) ? own.tabId : null;
    },

    closeUntilGone,

    async noteActivated(tabId: number): Promise<void> {
      focusedDuringCreate?.add(tabId);
      await exclusively(async () => {
        const own = await record.load();
        if (own?.tabId === tabId) await record.save(null);
      });
    },

    release,
  };
}
