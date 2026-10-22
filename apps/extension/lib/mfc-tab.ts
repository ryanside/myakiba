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

/** The tab the extension opened and the path it put there. A user's tab is never recorded. */
export const ownedTabSchema = z
  .strictObject({ tabId: z.number().int(), path: z.string() })
  .nullable();
export type OwnedTab = z.output<typeof ownedTabSchema>;

export class TabTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TabTimeoutError";
  }
}

const POLL_MS = 50;

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

  async function waitFor(tabId: number, path: string, deadline: number, signal: AbortSignal) {
    while (clock.now() < deadline) {
      signal.throwIfAborted();
      const tab = await tabs.get(tabId);
      if (tab.status === "complete" && mfcPath(tab.url) === path) return;
      await clock.sleep(POLL_MS, signal);
    }
    throw new TabTimeoutError(`tab ${tabId} did not load ${path} in time`);
  }

  async function createOwned(
    requester: Requester,
    url: string,
    deadline: number,
    signal: AbortSignal,
  ): Promise<number> {
    await exclusively(closeOwned);
    const { windowId } = await tabs.get(requester.tabId);
    if (windowId === undefined) throw new Error("the myakiba tab has no window");
    const properties: Parameters<TabsApi["create"]>[0] = { url, active: false, windowId };
    if (requester.context.cookieStoreId !== null) {
      properties.cookieStoreId = requester.context.cookieStoreId;
    }
    signal.throwIfAborted();
    const created = await tabs.create(properties);
    const tabId = created.id;
    if (tabId === undefined) throw new Error("the new MFC tab has no id");
    const { pathname } = new URL(url);
    await exclusively(() => owned.save({ tabId, path: pathname }));
    await waitFor(tabId, pathname, deadline, signal);
    return tabId;
  }

  async function navigateOwned(
    requester: Requester,
    url: string,
    signal: AbortSignal,
  ): Promise<number | null> {
    return exclusively(async () => {
      const own = await ownedTab();
      if (!own || !inContext(own.tab, requester.context)) return null;
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
    async lease(requester: Requester, deadline: number, signal: AbortSignal): Promise<MfcTabLease> {
      const own = await exclusively(ownedTab);
      if (own && inContext(own.tab, requester.context)) return { kind: "owned", tabId: own.tabId };
      if (borrowing) {
        const open = await tabs.query({
          url: `${origins.mfc}/*`,
          status: "complete",
          discarded: false,
        });
        const borrowed = open.find((tab) => inContext(tab, requester.context))?.id;
        if (borrowed !== undefined) return { kind: "borrowed", tabId: borrowed };
      }
      const url = `${origins.mfc}/`;
      const tabId = await throttle.load(signal, () =>
        createOwned(requester, url, deadline, signal),
      );
      return { kind: "owned", tabId };
    },

    /** Loads the item in a tab of the extension's own, never a borrowed one, and shows it. */
    async showChallenge(
      requester: Requester,
      mfcItemId: MfcItemId,
      deadline: number,
      signal: AbortSignal,
    ): Promise<number> {
      const url = mfcItemUrl(mfcItemId, origins);
      const tabId = await throttle.load(signal, async () => {
        const navigated = await navigateOwned(requester, url, signal);
        if (navigated === null) return createOwned(requester, url, deadline, signal);
        await waitFor(navigated, new URL(url).pathname, deadline, signal);
        return navigated;
      });
      await activate(tabId, signal);
      return tabId;
    },

    async isShowing(tabId: number, mfcItemId: MfcItemId): Promise<boolean> {
      const tab = await tabs.get(tabId);
      return (
        tab.status === "complete" &&
        mfcPath(tab.url) === new URL(mfcItemUrl(mfcItemId, origins)).pathname
      );
    },

    async handBack(requester: Requester, signal: AbortSignal): Promise<void> {
      selfActivatedTabId = null;
      if (signal.aborted) return;
      try {
        const tab = await tabs.update(requester.tabId, { active: true });
        if (tab?.windowId !== undefined) await windows.update(tab.windowId, { focused: true });
      } catch {
        // The myakiba tab closed during the challenge.
      }
    },

    async noteActivated(tabId: number): Promise<void> {
      if (selfActivatedTabId === tabId) {
        selfActivatedTabId = null;
        return;
      }
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
