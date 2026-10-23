import type { MfcItemId } from "@myakiba/mfc/page";
import type { Clock, SessionValue } from "./clock";
import { mfcItemUrl } from "./origins";
import type { Origins } from "./origins";
import { inContext, ownedTab } from "./owned-tab";
import type { LiveRequester, OwnedTab, TabsApi } from "./owned-tab";
import type { Throttle } from "./throttle";

export type WindowsApi = {
  readonly update: (windowId: number, info: { focused: boolean }) => Promise<{ id?: number }>;
};

export type MfcTabLease = { readonly kind: "borrowed" | "owned"; readonly tabId: number };

const NAVIGATION_POLL_MS = 500;

const tabIdOf = (tabId: number) => tabId;

export function createMfcTabs(deps: {
  readonly tabs: TabsApi;
  readonly windows: WindowsApi;
  readonly clock: Clock;
  readonly origins: Origins;
  readonly owned: SessionValue<OwnedTab>;
  readonly throttle: Pick<Throttle, "load">;
}) {
  const { tabs, windows, clock, origins } = deps;
  const own = ownedTab({
    tabs,
    clock,
    origin: origins.mfc,
    record: deps.owned,
    throttle: deps.throttle,
  });
  let borrowing = true;
  let selfActivatedTabId: number | null = null;

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
      const owned = await own.landedIn(context);
      if (owned !== null) return { kind: "owned", tabId: owned };
      if (borrowing) {
        const open = await tabs.query({
          url: `${origins.mfc}/*`,
          status: "complete",
          discarded: false,
        });
        const borrowed = open.find((tab) => inContext(tab, context))?.id;
        if (borrowed !== undefined) return { kind: "borrowed", tabId: borrowed };
      }
      const tabId = await own.loadOwned(requester, `${origins.mfc}/`, signal, tabIdOf);
      return { kind: "owned", tabId };
    },

    /** Loads the item in a tab of the extension's own, never a borrowed one, and shows it. */
    async showChallenge(
      requester: LiveRequester,
      mfcItemId: MfcItemId,
      signal: AbortSignal,
    ): Promise<number> {
      const url = mfcItemUrl(mfcItemId, origins);
      const tabId = await own.loadOwned(requester, url, signal, tabIdOf);
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
    dismiss: own.closeUntilGone,

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
      await own.noteActivated(tabId);
    },

    stopBorrowing(): void {
      borrowing = false;
    },

    async release(): Promise<void> {
      borrowing = true;
      await own.release();
    },
  };
}
