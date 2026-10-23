import type { MfcItemId } from "@myakiba/mfc/page";
import type { Clock, SessionValue } from "./clock";
import { PAGE_TIMEOUT_MS } from "./collect";
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
    turnMs: PAGE_TIMEOUT_MS,
  });
  let borrowing = true;

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
      return { kind: "owned", tabId: await own.load(requester, `${origins.mfc}/`, signal) };
    },

    async showChallenge(
      requester: LiveRequester,
      mfcItemId: MfcItemId,
      signal: AbortSignal,
    ): Promise<number> {
      const tabId = await own.load(requester, mfcItemUrl(mfcItemId, origins), signal);
      signal.throwIfAborted();
      await own.claim(tabId);
      const shown = await tabs.update(tabId, { active: true });
      if (shown?.windowId !== undefined) await windows.update(shown.windowId, { focused: true });
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

    async handBack(requester: LiveRequester, signal: AbortSignal): Promise<void> {
      if (signal.aborted) return;
      try {
        const tab = await tabs.update(requester().tabId, { active: true });
        if (tab?.windowId !== undefined) await windows.update(tab.windowId, { focused: true });
      } catch {
        // The myakiba tab closed during the challenge, or its run ended.
      }
    },

    claim: own.claim,

    stopBorrowing(): void {
      borrowing = false;
    },

    async release(): Promise<void> {
      borrowing = true;
      await own.release();
    },
  };
}
