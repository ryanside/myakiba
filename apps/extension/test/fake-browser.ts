import type { PortPicture, RunEvent } from "@myakiba/mfc/bridge";
import { mfcItemId } from "@myakiba/mfc/page";
import type { MfcItemId } from "@myakiba/mfc/page";
import type { Clock, SessionValue } from "../lib/clock";
import type { CollectedPage, PageRequest } from "../lib/collect";
import { createFetcher } from "../lib/fetcher";
import type { OwnedTab, TabsApi, WindowsApi } from "../lib/mfc-tab";
import type { Origins } from "../lib/origins";
import type { Requester, RunKey, TabContext } from "../lib/queue";
import { OPEN_THROTTLE } from "../lib/throttle";
import type { ThrottleState } from "../lib/throttle";

export const ORIGINS: Origins = {
  web: "http://myakiba.test",
  mfc: "http://mfc.test",
  mfcStatic: "http://static.mfc.test",
};

const NORMAL: TabContext = { incognito: false, cookieStoreId: null };
export const INCOGNITO: TabContext = { incognito: true, cookieStoreId: null };

export function itemId(value: number): MfcItemId {
  const id = mfcItemId(value);
  if (id === null) throw new Error(`${value} is not an MFC item id`);
  return id;
}

async function flushMicrotasks(rounds: number): Promise<void> {
  for (let round = 0; round < rounds; round++) {
    await new Promise((resolve) => {
      setImmediate(resolve);
    });
  }
}

export type FakeClock = Clock & {
  readonly runUntil: (done: () => boolean) => Promise<void>;
  readonly runUntilIdle: () => Promise<void>;
};

export function fakeClock(start = 1_000_000): FakeClock {
  let now = start;
  let timers: { at: number; fire: () => void }[] = [];

  function fireNext(): boolean {
    const [next] = timers.toSorted((a, b) => a.at - b.at);
    if (!next) return false;
    timers = timers.filter((timer) => timer !== next);
    now = Math.max(now, next.at);
    next.fire();
    return true;
  }

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
        await flushMicrotasks(10);
        if (done()) return;
        if (!fireNext()) throw new Error("nothing left to run, and the condition never held");
      }
      throw new Error("the condition never held");
    },
    async runUntilIdle() {
      for (let step = 0; step < 100_000; step++) {
        await flushMicrotasks(100);
        if (!fireNext()) return;
      }
      throw new Error("the clock never went idle");
    },
  };
}

/** Each read and write takes a turn of the event loop, as storage.session does. */
export function memoryValue<T>(initial: T): SessionValue<T> & { readonly peek: () => T } {
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
    peek: () => value,
  };
}

type FakeTab = {
  id: number;
  windowId: number;
  url: string;
  status: string;
  active: boolean;
  incognito: boolean;
  cookieStoreId?: string;
};

const WINDOWS = new Map([
  [1, NORMAL],
  [2, INCOGNITO],
]);

/** Activating a tab runs the onActivated listener before the call returns, as Chrome does. */
function fakeTabs(clock: Clock, activated: (tabId: number) => Promise<void>) {
  const tabs = new Map<number, FakeTab>();
  const log: string[] = [];
  const loads: { readonly at: number; readonly url: string }[] = [];
  let nextId = 100;

  function activate(tabId: number): void {
    const tab = tabs.get(tabId);
    if (!tab || tab.active) return;
    for (const other of tabs.values()) {
      if (other.windowId === tab.windowId) other.active = false;
    }
    tab.active = true;
    void activated(tabId);
  }

  function add(url: string, windowId: number, status: string, cookieStoreId?: string): FakeTab {
    const context = WINDOWS.get(windowId);
    if (!context) throw new Error(`No window with id: ${windowId}`);
    const tab: FakeTab = {
      id: nextId++,
      windowId,
      url,
      status,
      active: false,
      incognito: context.incognito,
    };
    if (cookieStoreId !== undefined) tab.cookieStoreId = cookieStoreId;
    tabs.set(tab.id, tab);
    return tab;
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
    async create({ url, active, windowId = 1, cookieStoreId }) {
      const tab = add(url, windowId, "loading", cookieStoreId);
      log.push(`create ${active ? "active" : "inactive"} ${url}`);
      loads.push({ at: clock.now(), url });
      if (active) activate(tab.id);
      return { ...tab };
    },
    async update(tabId, { url, active }) {
      const tab = tabs.get(tabId);
      if (!tab) throw new Error(`No tab with id: ${tabId}`);
      if (url !== undefined) {
        Object.assign(tab, { url, status: "loading" });
        loads.push({ at: clock.now(), url });
      }
      log.push(`update ${tabId}${url === undefined ? "" : ` ${url}`}${active ? " active" : ""}`);
      if (active) activate(tabId);
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
    loads,
    open(url: string, options: { windowId?: number; cookieStoreId?: string } = {}): number {
      return add(url, options.windowId ?? 1, "complete", options.cookieStoreId).id;
    },
    set(tabId: number, change: Partial<FakeTab>): void {
      const tab = tabs.get(tabId);
      if (tab) Object.assign(tab, change);
    },
    activate,
    get: (tabId: number): FakeTab | undefined => tabs.get(tabId),
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
  return { status: 200, cfMitigated: null, retryAfter: null, html, ...overrides };
}

type CollectCall = PageRequest & {
  readonly tabId: number;
  readonly tab: Readonly<FakeTab> | undefined;
  readonly at: number;
};

export function fakeExtension(options: {
  readonly pages: (request: PageRequest) => CollectedPage | Promise<CollectedPage>;
  readonly clock?: FakeClock;
  readonly throttleState?: SessionValue<ThrottleState>;
  readonly ownedTab?: SessionValue<OwnedTab>;
  readonly gatedPicture?: (url: string) => Promise<PortPicture | null>;
  readonly publicPicture?: (url: URL) => Promise<PortPicture | null>;
}) {
  const clock = options.clock ?? fakeClock();
  const tabs = fakeTabs(clock, (tabId) => fetcher.noteTabActivated(tabId));
  const myakiba: Requester = { tabId: tabs.open(`${ORIGINS.web}/sync`), context: NORMAL };
  const calls: CollectCall[] = [];
  const pictureUrls: string[] = [];
  const fetcher = createFetcher({
    tabs: tabs.api,
    windows,
    clock,
    random: () => 0.5,
    origins: ORIGINS,
    throttleState: options.throttleState ?? memoryValue(OPEN_THROTTLE),
    ownedTab: options.ownedTab ?? memoryValue<OwnedTab>(null),
    collectPage: async (tabId, request) => {
      const tab = tabs.get(tabId);
      calls.push({ ...request, tabId, tab: tab && { ...tab }, at: clock.now() });
      return options.pages(request);
    },
    fetchGatedPicture: async (_tabId, url) => {
      pictureUrls.push(url);
      return options.gatedPicture
        ? options.gatedPicture(url)
        : { base64: "/9j/", contentType: "image/jpeg" };
    },
    fetchPublicPicture: async (url) => {
      pictureUrls.push(url.href);
      return options.publicPicture
        ? options.publicPicture(url)
        : { base64: "AQID", contentType: "image/jpeg" };
    },
  });

  function run(ids: readonly number[], requester: Requester = myakiba) {
    const key = crypto.randomUUID() as RunKey;
    const events: RunEvent<PortPicture>[] = [];
    fetcher.submit({
      key,
      requester,
      mfcItemIds: ids.map(itemId),
      emit: (event) => events.push(event),
    });
    return {
      key,
      events,
      done: () => events.some((event) => event.type === "done"),
      items: () => events.filter((event) => event.type === "item"),
      results: () => events.flatMap((event) => (event.type === "item" ? [event.result] : [])),
    };
  }

  return { clock, tabs, myakiba, calls, pictureUrls, fetcher, run, settle: clock.runUntilIdle };
}
