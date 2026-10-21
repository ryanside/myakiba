import * as z from "zod";
import type { MfcItemId } from "@myakiba/mfc/page";
import type { Clock, SessionValue } from "./clock";
import { mfcItemUrl } from "./origins";
import type { Origins } from "./origins";

export type Tab = {
  readonly id?: number;
  readonly windowId?: number;
  readonly status?: string;
  readonly url?: string;
  readonly title?: string;
};

export type TabsApi = {
  readonly get: (tabId: number) => Promise<Tab>;
  readonly query: (query: { url: string; status: "complete"; discarded: false }) => Promise<Tab[]>;
  readonly create: (properties: { url: string; active: boolean }) => Promise<Tab>;
  readonly update: (
    tabId: number,
    properties: { url?: string; active?: boolean },
  ) => Promise<Tab | undefined>;
  readonly remove: (tabId: number) => Promise<void>;
};

export type WindowsApi = {
  readonly update: (windowId: number, info: { focused: boolean }) => Promise<{ id?: number }>;
};

export type MfcTabLease =
  | { readonly kind: "borrowed"; readonly tabId: number }
  | { readonly kind: "owned"; readonly tabId: number };

export const ownedTabSchema = z
  .strictObject({ tabId: z.number().int(), path: z.string(), claimed: z.boolean() })
  .nullable();
export type OwnedTab = z.output<typeof ownedTabSchema>;

export class TabTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TabTimeoutError";
  }
}

const POLL_MS = 50;

export function createMfcTabs(deps: {
  readonly tabs: TabsApi;
  readonly windows: WindowsApi;
  readonly clock: Clock;
  readonly origins: Origins;
  readonly owned: SessionValue<OwnedTab>;
}) {
  const { tabs, windows, clock, origins, owned } = deps;
  let ignoreFocusUntilHandBack = false;

  function mfcPath(url: string | undefined): string | null {
    const parsed = URL.parse(url ?? "");
    return parsed?.origin === origins.mfc ? parsed.pathname : null;
  }

  async function stillOwned(): Promise<number | null> {
    const tab = await owned.load();
    if (!tab) return null;
    const live = tab.claimed ? null : await tabs.get(tab.tabId).catch(() => null);
    if (live && mfcPath(live.url) === tab.path) return tab.tabId;
    await owned.save(null);
    return null;
  }

  async function waitFor(
    tabId: number,
    ready: (tab: Tab) => boolean,
    timeoutMs: number,
    signal?: AbortSignal,
  ) {
    const deadline = clock.now() + timeoutMs;
    while (clock.now() < deadline) {
      signal?.throwIfAborted();
      const tab = await tabs.get(tabId);
      if (tab.status === "complete" && mfcPath(tab.url) !== null && ready(tab)) return tab;
      await clock.sleep(POLL_MS, signal);
    }
    throw new TabTimeoutError(`tab ${tabId} did not load in ${timeoutMs} ms`);
  }

  async function focus(tab: Tab | undefined): Promise<void> {
    if (tab?.windowId !== undefined) await windows.update(tab.windowId, { focused: true });
  }

  return {
    async lease(timeoutMs: number): Promise<MfcTabLease> {
      const ownedTabId = await stillOwned();
      if (ownedTabId !== null) return { kind: "owned", tabId: ownedTabId };
      const [open] = await tabs.query({
        url: `${origins.mfc}/*`,
        status: "complete",
        discarded: false,
      });
      if (open?.id !== undefined) return { kind: "borrowed", tabId: open.id };
      const created = await tabs.create({ url: `${origins.mfc}/`, active: false });
      if (created.id === undefined) throw new Error("the new MFC tab has no id");
      await owned.save({ tabId: created.id, path: "/", claimed: false });
      await waitFor(created.id, () => true, timeoutMs);
      return { kind: "owned", tabId: created.id };
    },

    async showChallenge(lease: MfcTabLease, mfcItemId: MfcItemId): Promise<number> {
      const url = mfcItemUrl(mfcItemId, origins);
      ignoreFocusUntilHandBack = true;
      const tab =
        lease.kind === "owned"
          ? await tabs.update(lease.tabId, { url, active: true })
          : await tabs.create({ url, active: true });
      const tabId = tab?.id ?? lease.tabId;
      await owned.save({ tabId, path: new URL(url).pathname, claimed: false });
      await focus(tab);
      return tabId;
    },

    /** Resolves once the page in the challenge tab is no longer Cloudflare's. */
    async waitPastChallenge(tabId: number, timeoutMs: number, signal: AbortSignal): Promise<void> {
      await waitFor(tabId, (tab) => !/just a moment/i.test(tab.title ?? ""), timeoutMs, signal);
    },

    async handBack(requesterTabId: number | undefined): Promise<void> {
      ignoreFocusUntilHandBack = false;
      if (requesterTabId === undefined) return;
      try {
        await focus(await tabs.update(requesterTabId, { active: true }));
      } catch {
        // The myakiba tab closed during the challenge.
      }
    },

    async noteActivated(tabId: number): Promise<void> {
      if (ignoreFocusUntilHandBack) return;
      const tab = await owned.load();
      if (tab?.tabId === tabId) await owned.save({ ...tab, claimed: true });
    },

    async release(): Promise<void> {
      const tabId = await stillOwned();
      await owned.save(null);
      if (tabId !== null) await tabs.remove(tabId);
    },
  };
}
