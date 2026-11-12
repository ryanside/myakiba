import type { MfcItemId } from "@myakiba/mfc/page";
import { Result } from "better-result";
import type { Clock } from "./clock";
import { PAGE_TIMEOUT_MS } from "./collect";
import { MfcLoadTimedOut } from "./errors/mfc-load-timed-out";
import type { SessionStorageUnavailable } from "./errors/session-storage-unavailable";
import type { TabEditRefused } from "./errors/tab-edit-refused";
import type { TabQueryFailed } from "./errors/tab-query-failed";
import type { WindowFocusRefused } from "./errors/window-focus-refused";
import { withoutPort } from "./match-pattern";
import { mfcItemUrl } from "./origins";
import type { Origins } from "./origins";
import { inContext, onOrigin, ownedTab } from "./owned-tab";
import type { LiveRequester, OwnedTab, TabOpenFailure } from "./owned-tab";
import type { SessionValue } from "./session-value";
import type { Tabs } from "./tabs";
import type { Throttle } from "./throttle";

export type MfcTabLease = { readonly kind: "borrowed" | "owned"; readonly tabId: number };

/** How the extension fails to find or open an MFC tab for an item. */
export type LeaseFailure = TabOpenFailure | TabQueryFailed;

/** How the extension fails to show the user the challenge's tab. */
export type ChallengeShowFailure = TabOpenFailure | TabEditRefused | WindowFocusRefused;

const NAVIGATION_POLL_MS = 500;

export function createMfcTabs(deps: {
  readonly tabs: Tabs;
  readonly clock: Clock;
  readonly origins: Origins;
  readonly owned: SessionValue<OwnedTab>;
  readonly throttle: Pick<Throttle, "load">;
}) {
  const { tabs, clock, origins } = deps;
  const own = ownedTab({
    tabs,
    clock,
    origin: origins.mfc,
    record: deps.owned,
    throttle: deps.throttle,
    turnMs: PAGE_TIMEOUT_MS,
  });
  let borrowing = true;

  async function borrowable(
    context: Parameters<typeof inContext>[1],
  ): Promise<Result<number | null, TabQueryFailed>> {
    if (!borrowing) return Result.ok(null);
    // Firefox finds no tab for a pattern with a port, so the query names the host alone and the origin is checked here.
    const open = await tabs.query({
      url: withoutPort(`${origins.mfc}/*`),
      status: "complete",
      discarded: false,
    });
    return open.map(
      (found) =>
        found.find((tab) => inContext(tab, context) && onOrigin(tab.url, origins.mfc))?.id ?? null,
    );
  }

  return {
    lease(
      requester: LiveRequester,
      signal: AbortSignal,
    ): Promise<Result<MfcTabLease, LeaseFailure>> {
      return Result.gen(async function* () {
        const { context } = requester();
        const owned = yield* Result.await(own.landedIn(context));
        if (owned !== null) return Result.ok({ kind: "owned", tabId: owned } as const);
        const borrowed = yield* Result.await(borrowable(context));
        if (borrowed !== null) return Result.ok({ kind: "borrowed", tabId: borrowed } as const);
        const tabId = yield* Result.await(own.load(requester, `${origins.mfc}/`, signal));
        return Result.ok({ kind: "owned", tabId } as const);
      });
    },

    showChallenge(
      requester: LiveRequester,
      mfcItemId: MfcItemId,
      signal: AbortSignal,
    ): Promise<Result<number, ChallengeShowFailure>> {
      return Result.gen(async function* () {
        const tabId = yield* Result.await(
          own.load(requester, mfcItemUrl(mfcItemId, origins), signal),
        );
        // A run that stopped waiting while its tab loaded gets nothing shown.
        if (signal.aborted) return Result.err(new MfcLoadTimedOut({ timeoutMs: PAGE_TIMEOUT_MS }));
        const shown = yield* Result.await(tabs.update(tabId, { active: true }));
        yield* Result.await(own.claim(tabId));
        if (shown?.windowId !== undefined) yield* Result.await(tabs.focusWindow(shown.windowId));
        return Result.ok(tabId);
      });
    },

    /**
     * Watches the tab's status, URL and title, which is cheap, unlike reading the page. Ends when the tab closes.
     * @yields {"shown" | "reloaded"} "shown" for the page the tab already shows, then "reloaded" for each navigation it finishes.
     */
    async *navigations(tabId: number, signal: AbortSignal): AsyncGenerator<"shown" | "reloaded"> {
      let shown: string | null = null;
      let loading = false;
      while (!signal.aborted) {
        const watched = await tabs.get(tabId);
        if (watched.isErr()) return;
        const tab = watched.value;
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

    /** Leaves focus where it is once the run ended. Fails when the myakiba tab closed during the challenge. */
    handBack(
      requester: LiveRequester,
      signal: AbortSignal,
    ): Promise<Result<void, TabEditRefused | WindowFocusRefused>> {
      return Result.gen(async function* () {
        if (signal.aborted) return Result.ok();
        const { tabId } = requester();
        const tab = yield* Result.await(tabs.update(tabId, { active: true }));
        if (tab?.windowId !== undefined) yield* Result.await(tabs.focusWindow(tab.windowId));
        return Result.ok();
      });
    },

    claim: own.claim,

    /** Closes the extension's own MFC tab, unless the user took it, so the next lease loads a fresh one. */
    closeOwned: own.release,

    stopBorrowing(): void {
      borrowing = false;
    },

    release(): Promise<Result<void, SessionStorageUnavailable>> {
      borrowing = true;
      return own.release();
    },
  };
}
