import type { PortPicture, RunEvent } from "@myakiba/mfc/bridge";
import { mfcItemId } from "@myakiba/mfc/page";
import type { MfcItemId } from "@myakiba/mfc/page";
import type { Clock, SessionValue } from "../lib/clock";
import type { CollectRequest, CollectedPage } from "../lib/collect";
import { createFetcher } from "../lib/fetcher";
import type { OwnedTab, TabsApi, WindowsApi } from "../lib/mfc-tab";
import type { Origins } from "../lib/origins";
import type { RunKey } from "../lib/queue";
import { OPEN_THROTTLE } from "../lib/throttle";
import type { ThrottleState } from "../lib/throttle";

export const ORIGINS: Origins = {
  web: "http://myakiba.test",
  mfc: "http://mfc.test",
  mfcStatic: "http://static.mfc.test",
};

export function itemId(value: number): MfcItemId {
  const id = mfcItemId(value);
  if (id === null) throw new Error(`${value} is not an MFC item id`);
  return id;
}

async function flushMicrotasks(): Promise<void> {
  for (let round = 0; round < 10; round++) {
    await new Promise((resolve) => {
      setImmediate(resolve);
    });
  }
}

export type FakeClock = Clock & {
  readonly runUntil: (done: () => boolean) => Promise<void>;
};

export function fakeClock(start = 1_000_000): FakeClock {
  let now = start;
  let timers: { at: number; fire: () => void }[] = [];
  return {
    now: () => now,
    sleep: (ms, signal) =>
      new Promise((resolve) => {
        if (signal?.aborted) {
          resolve();
          return;
        }
        const timer = { at: now + ms, fire: () => resolve() };
        timers.push(timer);
        signal?.addEventListener("abort", () => {
          timers = timers.filter((other) => other !== timer);
          resolve();
        });
      }),
    async runUntil(done) {
      for (let step = 0; step < 100_000; step++) {
        await flushMicrotasks();
        if (done()) return;
        const [next] = timers.toSorted((a, b) => a.at - b.at);
        if (!next) throw new Error("nothing left to run, and the condition never held");
        timers = timers.filter((timer) => timer !== next);
        now = Math.max(now, next.at);
        next.fire();
      }
      throw new Error("the condition never held");
    },
  };
}

/** Each read and write takes a turn of the event loop, as storage.session does. */
export function memoryValue<T>(initial: T): SessionValue<T> {
  let value = initial;
  const later = () =>
    new Promise((resolve) => {
      setImmediate(resolve);
    });
  return {
    load: async () => {
      await later();
      return value;
    },
    save: async (next) => {
      await later();
      value = next;
    },
  };
}

type FakeTab = { id: number; windowId: number; url: string; status: string; title: string };

/** Activating a tab runs the onActivated listener before the call returns, as Chrome does. */
function fakeTabs(activated: (tabId: number) => Promise<void>) {
  const dispatchActivated = (tabId: number) => {
    void activated(tabId);
  };
  const tabs = new Map<number, FakeTab>();
  const log: string[] = [];
  let nextId = 100;

  function titleOf(url: string): string {
    return url.includes("/item/") ? "Just a moment..." : "MyFigureCollection";
  }

  const api: TabsApi = {
    async get(tabId) {
      const tab = tabs.get(tabId);
      if (!tab) throw new Error(`No tab with id: ${tabId}`);
      const seen = { ...tab };
      tab.status = "complete";
      return seen;
    },
    async query({ url }) {
      const prefix = url.replace(/\*$/, "");
      return [...tabs.values()]
        .filter((tab) => tab.status === "complete" && tab.url.startsWith(prefix))
        .map((tab) => ({ ...tab }));
    },
    async create({ url, active }) {
      const tab = { id: nextId++, windowId: 1, url, status: "loading", title: titleOf(url) };
      tabs.set(tab.id, tab);
      log.push(`create ${active ? "active" : "inactive"} ${url}`);
      if (active) dispatchActivated(tab.id);
      return { ...tab };
    },
    async update(tabId, { url, active }) {
      const tab = tabs.get(tabId);
      if (!tab) throw new Error(`No tab with id: ${tabId}`);
      if (url !== undefined) Object.assign(tab, { url, status: "loading", title: titleOf(url) });
      log.push(`update ${tabId}${url === undefined ? "" : ` ${url}`}${active ? " active" : ""}`);
      if (active) dispatchActivated(tabId);
      return { ...tab };
    },
    async remove(tabId) {
      tabs.delete(tabId);
      log.push(`remove ${tabId}`);
    },
  };

  return {
    api,
    log,
    open(url: string): number {
      const tab = { id: nextId++, windowId: 1, url, status: "complete", title: titleOf(url) };
      tabs.set(tab.id, tab);
      return tab.id;
    },
    set(tabId: number, change: Partial<FakeTab>): void {
      const tab = tabs.get(tabId);
      if (tab) Object.assign(tab, change);
    },
    has: (tabId: number) => tabs.has(tabId),
  };
}

const windows: WindowsApi = { update: async (windowId) => ({ id: windowId }) };

export function itemPage(id: number, picture: "gated" | "public" | null = null): string {
  const pictureUrl =
    picture === "gated"
      ? `https://myfigurecollection.net/?_tb=commit&amp;commit=nsp&amp;objectType=item&amp;objectId=${id}&amp;size=1`
      : `https://static.myfigurecollection.net/upload/items/1/${id}.jpg`;
  return [
    `<html><head><title>Item ${id}</title>`,
    `<link rel="canonical" href="https://myfigurecollection.net/item/${id}">`,
    picture ? `<meta property="og:image" content="${pictureUrl}">` : "",
    `</head><body><div class="tbx-menu user-menu"></div><h1 class="title">Item ${id}</h1></body></html>`,
  ].join("");
}

export function notFoundPage(signedIn: boolean): string {
  const menu = signedIn ? '<div class="tbx-menu user-menu"></div>' : "";
  return `<html><head><title>MyFigureCollection.net</title></head><body>${menu}<p>The page you requested was not found.</p></body></html>`;
}

export const CHALLENGE_PAGE = "<html><head><title>Just a moment...</title></head></html>";

export function page(html: string, overrides: Partial<CollectedPage> = {}): CollectedPage {
  return { status: 200, cfMitigated: null, retryAfter: null, html, picture: null, ...overrides };
}

type CollectCall = CollectRequest & { readonly tabId: number; readonly at: number };

export function fakeExtension(options: {
  readonly pages: (request: CollectRequest) => CollectedPage | Promise<CollectedPage>;
  readonly clock?: FakeClock;
  readonly throttleState?: SessionValue<ThrottleState>;
  readonly publicPicture?: (url: URL) => Promise<PortPicture | null>;
}) {
  const clock = options.clock ?? fakeClock();
  const tabs = fakeTabs((tabId) => fetcher.noteTabActivated(tabId));
  const ownedTab = memoryValue<OwnedTab>(null);
  const calls: CollectCall[] = [];
  const pictureUrls: string[] = [];
  const fetcher = createFetcher({
    tabs: tabs.api,
    windows,
    clock,
    random: () => 0.5,
    origins: ORIGINS,
    throttleState: options.throttleState ?? memoryValue(OPEN_THROTTLE),
    ownedTab,
    collect: async (tabId, request) => {
      calls.push({ ...request, tabId, at: clock.now() });
      return options.pages(request);
    },
    fetchPublicPicture: async (url) => {
      pictureUrls.push(url.href);
      return options.publicPicture
        ? options.publicPicture(url)
        : { base64: "AQID", contentType: "image/jpeg" };
    },
  });

  function run(ids: readonly number[], requesterTabId = 1) {
    const key = crypto.randomUUID() as RunKey;
    const events: RunEvent<PortPicture>[] = [];
    fetcher.submit({
      key,
      requesterTabId,
      mfcItemIds: ids.map(itemId),
      emit: (event) => events.push(event),
    });
    return {
      key,
      events,
      done: () => events.some((event) => event.type === "done"),
      items: () => events.filter((event) => event.type === "item"),
    };
  }

  async function settle(): Promise<void> {
    let idle = false;
    const draining = (async () => {
      await fetcher.idle();
      idle = true;
    })();
    await clock.runUntil(() => idle);
    await draining;
  }

  return { clock, tabs, calls, pictureUrls, ownedTab, fetcher, run, settle };
}
