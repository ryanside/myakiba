import * as z from "zod";
import type { MfcItemId } from "@myakiba/mfc/page";
import type { Clock, SessionValue } from "./clock";
import { mfcItemUrl } from "./origins";
import type { Origins } from "./origins";
import { sameContext } from "./queue";
import type { Requester, TabContext } from "./queue";
import type { Throttle } from "./throttle";

export type Tab = {
  readonly id?: number;
  readonly windowId?: number;
  readonly status?: string;
  readonly url?: string;
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

export type WindowsApi = {
  readonly update: (windowId: number, info: { focused: boolean }) => Promise<{ id?: number }>;
};

export type MfcTabLease = { readonly kind: "borrowed" | "owned"; readonly tabId: number };

/** The first run still waiting for the job. Read at each tab step, since runs cancel at any time. */
export type LiveRequester = () => Requester;

/** The tab the extension opened and the path it put there. A user's tab is never recorded. */
export const ownedTabSchema = z
  .strictObject({ tabId: z.number().int(), path: z.string() })
  .nullable();
export type OwnedTab = z.output<typeof ownedTabSchema>;

class TabTakenError extends Error {
  constructor(tabId: number) {
    super(`the user took the new MFC tab ${tabId}`);
    this.name = "TabTakenError";
  }
}

const POLL_MS = 50;
const NAVIGATION_POLL_MS = 500;

function inContext(tab: Tab, context: TabContext): boolean {
  return (
    tab.incognito !== undefined &&
    sameContext({ incognito: tab.incognito, cookieStoreId: tab.cookieStoreId ?? null }, context)
  );
}

export function createMfcTabs(deps: {
  readonly tabs: TabsApi;
  readonly windows: WindowsApi;
  readonly clock: Clock;
  readonly origins: Origins;
  readonly owned: SessionValue<OwnedTab>;
  readonly throttle: Pick<Throttle, "load">;
}) {
  const { tabs, windows, clock, origins, owned, throttle } = deps;
  let borrowing = true;
  let selfActivatedTabId: number | null = null;
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

  function mfcPath(url: string | undefined): string | null {
    const parsed = URL.parse(url ?? "");
    return parsed?.origin === origins.mfc ? parsed.pathname : null;
  }

  /** A new tab's `url` stays empty until its first page commits, so another web page there means the user took it. */
  function committedElsewhere(tab: Tab, path: string): boolean {
    const protocol = URL.parse(tab.url ?? "")?.protocol;
    return (protocol === "http:" || protocol === "https:") && mfcPath(tab.url) !== path;
  }

  async function windowOf(tabId: number): Promise<number> {
    const { windowId } = await tabs.get(tabId);
    if (windowId === undefined) throw new Error(`tab ${tabId} has no window`);
    return windowId;
  }

  async function ownedTab(): Promise<{ readonly tabId: number; readonly tab: Tab } | null> {
    const record = await owned.load();
    if (!record) return null;
    const tab = await tabs.get(record.tabId).catch(() => null);
    if (tab && mfcPath(tab.url) === record.path) return { tabId: record.tabId, tab };
    await owned.save(null);
    return null;
  }

  async function closeOwned(): Promise<void> {
    const own = await ownedTab();
    await owned.save(null);
    // The tab may close between the read and the remove.
    if (own) await tabs.remove(own.tabId).catch(() => null);
  }

  async function closeUntilGone(tabId: number): Promise<void> {
    const ours = await exclusively(async () => {
      const record = await owned.load();
      if (record?.tabId !== tabId) return false;
      await owned.save(null);
      return true;
    });
    if (!ours) return;
    // Chrome refuses to close a tab while the user drags it.
    while ((await tabs.get(tabId).catch(() => null)) !== null) {
      await tabs.remove(tabId).catch(() => clock.sleep(POLL_MS));
    }
  }

  async function waitOrClose(
    tabId: number,
    path: string,
    timeout: AbortSignal,
    created = false,
  ): Promise<void> {
    try {
      for (;;) {
        timeout.throwIfAborted();
        const tab = await tabs.get(tabId);
        if (tab.status === "complete" && mfcPath(tab.url) === path) return;
        if (created && committedElsewhere(tab, path)) throw new TabTakenError(tabId);
        await clock.sleep(POLL_MS, timeout);
      }
    } catch (error) {
      if (timeout.aborted) await closeUntilGone(tabId);
      throw error;
    }
  }

  async function createOwned(
    requester: LiveRequester,
    url: string,
    signal: AbortSignal,
    timeout: AbortSignal,
  ): Promise<number> {
    await exclusively(closeOwned);
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
    if (tabId === undefined) throw new Error("the new MFC tab has no id");
    const { pathname } = new URL(url);
    await exclusively(async () => {
      if (focused.has(tabId)) throw new TabTakenError(tabId);
      await owned.save({ tabId, path: pathname });
    });
    await waitOrClose(tabId, pathname, timeout, true);
    return tabId;
  }

  /** Moves the owned tab to `url` when it is in the requester's window, so a challenge shows where they are. */
  async function navigateOwned(
    requester: LiveRequester,
    url: string,
    signal: AbortSignal,
  ): Promise<number | null> {
    const { tabId: requesterTabId, context } = requester();
    const windowId = await windowOf(requesterTabId);
    return exclusively(async () => {
      const own = await ownedTab();
      if (!own || !inContext(own.tab, context) || own.tab.windowId !== windowId) return null;
      signal.throwIfAborted();
      await tabs.update(own.tabId, { url });
      await owned.save({ tabId: own.tabId, path: new URL(url).pathname });
      return own.tabId;
    });
  }

  async function activate(tabId: number, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    const tab = await tabs.get(tabId);
    signal.throwIfAborted();
    if (!tab.active) selfActivatedTabId = tabId;
    const shown = await tabs.update(tabId, { active: true });
    signal.throwIfAborted();
    if (shown?.windowId !== undefined) await windows.update(shown.windowId, { focused: true });
  }

  return {
    async lease(requester: LiveRequester, signal: AbortSignal): Promise<MfcTabLease> {
      const { context } = requester();
      const own = await exclusively(ownedTab);
      if (own && inContext(own.tab, context)) return { kind: "owned", tabId: own.tabId };
      if (borrowing) {
        const open = await tabs.query({
          url: `${origins.mfc}/*`,
          status: "complete",
          discarded: false,
        });
        const borrowed = open.find((tab) => inContext(tab, context))?.id;
        if (borrowed !== undefined) return { kind: "borrowed", tabId: borrowed };
      }
      const tabId = await throttle.load(signal, (timeout) =>
        createOwned(requester, `${origins.mfc}/`, signal, timeout),
      );
      return { kind: "owned", tabId };
    },

    /** Loads the item in a tab of the extension's own, never a borrowed one, and shows it. */
    async showChallenge(
      requester: LiveRequester,
      mfcItemId: MfcItemId,
      signal: AbortSignal,
    ): Promise<number> {
      const url = mfcItemUrl(mfcItemId, origins);
      const tabId = await throttle.load(signal, async (timeout) => {
        const navigated = await navigateOwned(requester, url, signal);
        if (navigated === null) return createOwned(requester, url, signal, timeout);
        await waitOrClose(navigated, new URL(url).pathname, timeout);
        return navigated;
      });
      await activate(tabId, signal);
      return tabId;
    },

    /**
     * Watches the tab's status, URL and title, which is cheap, unlike reading the page. Ends when the tab closes.
     * @yields {"shown" | "reloaded"} "shown" for the page the tab already shows, then "reloaded" for each navigation it finishes.
     */
    async *navigations(tabId: number, signal: AbortSignal): AsyncGenerator<"shown" | "reloaded"> {
      let shown: string | null = null;
      let loading = false;
      while (!signal.aborted) {
        const tab = await tabs.get(tabId).catch(() => null);
        if (!tab) return;
        const page = `${tab.url ?? ""}\n${tab.title ?? ""}`;
        if (tab.status !== "complete") loading = true;
        else if (shown === null || loading || page !== shown) {
          const navigation = shown === null && !loading ? "shown" : "reloaded";
          shown = page;
          loading = false;
          yield navigation;
        }
        await clock.sleep(NAVIGATION_POLL_MS, signal);
      }
    },

    /** Closes a challenge tab nobody solved, if it is still the extension's, so a reload in it cannot run on. */
    async dismiss(tabId: number): Promise<void> {
      await exclusively(async () => {
        const record = await owned.load();
        if (record?.tabId === tabId) await closeOwned();
      });
    },

    async handBack(requester: LiveRequester, signal: AbortSignal): Promise<void> {
      selfActivatedTabId = null;
      if (signal.aborted) return;
      try {
        const tab = await tabs.update(requester().tabId, { active: true });
        if (tab?.windowId !== undefined) await windows.update(tab.windowId, { focused: true });
      } catch {
        // The myakiba tab closed during the challenge, or its run ended.
      }
    },

    async noteActivated(tabId: number): Promise<void> {
      if (selfActivatedTabId === tabId) {
        selfActivatedTabId = null;
        return;
      }
      focusedDuringCreate?.add(tabId);
      await exclusively(async () => {
        const record = await owned.load();
        if (record?.tabId === tabId) await owned.save(null);
      });
    },

    stopBorrowing(): void {
      borrowing = false;
    },

    async release(): Promise<void> {
      borrowing = true;
      await exclusively(closeOwned);
    },
  };
}
