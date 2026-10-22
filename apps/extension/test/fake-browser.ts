import type { PortPicture, RunEvent } from "@myakiba/mfc/bridge";
import { mfcItemId } from "@myakiba/mfc/page";
import type { MfcItemId } from "@myakiba/mfc/page";
import type { Clock, SessionValue } from "../lib/clock";
import type { CollectedPage, PageRequest } from "../lib/collect";
import { createFetcher } from "../lib/fetcher";
import type { Fetcher } from "../lib/fetcher";
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
/** A second normal window, so a test can tell which window the extension focuses. */
export const OTHER_WINDOW = 3;

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
        await flushMicrotasks(100);
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
  title: string;
  completesAt: number;
  active: boolean;
  incognito: boolean;
  cookieStoreId?: string;
};

export type Load = {
  readonly tabId: number;
  readonly url: string;
  readonly at: number;
  readonly byUser: boolean;
  endedAt: number | null;
};

/** Loads the extension started before every earlier load had ended `gapMs` ago. The user may load a page any time. */
export function tooClose(loads: readonly Load[], gapMs: number) {
  const tooSoon: { readonly after: Load; readonly load: Load }[] = [];
  let latest: Load | null = null;
  for (const load of loads) {
    if (latest && !load.byUser && load.at - (latest.endedAt ?? Infinity) < gapMs) {
      tooSoon.push({ after: latest, load });
    }
    if (!latest || (load.endedAt ?? Infinity) > (latest.endedAt ?? Infinity)) latest = load;
  }
  return tooSoon;
}

const WINDOWS = new Map([
  [1, NORMAL],
  [2, INCOGNITO],
  [OTHER_WINDOW, NORMAL],
]);

/** Activating a tab runs the onActivated listener before the call returns, as Chrome does. */
function fakeTabs(
  clock: Clock,
  options: {
    readonly activated: (tabId: number) => Promise<void>;
    readonly navigationMs: () => number;
    readonly created: (tabId: number) => void;
  },
) {
  const tabs = new Map<number, FakeTab>();
  const log: string[] = [];
  const loads: Load[] = [];
  const focused: number[] = [];
  let nextId = 100;

  function status(tab: FakeTab): string {
    return clock.now() >= tab.completesAt ? "complete" : "loading";
  }

  function view(tab: FakeTab) {
    const { completesAt, ...seen } = tab;
    return { ...seen, status: clock.now() >= completesAt ? "complete" : "loading" };
  }

  function activate(tabId: number): void {
    const tab = tabs.get(tabId);
    if (!tab || tab.active) return;
    for (const other of tabs.values()) {
      if (other.windowId === tab.windowId) other.active = false;
    }
    tab.active = true;
    void options.activated(tabId);
  }

  function stopLoading(tabId: number): void {
    for (const running of loads) {
      if (running.tabId === tabId && (running.endedAt ?? Infinity) > clock.now()) {
        running.endedAt = clock.now();
      }
    }
  }

  function load(tab: FakeTab, url: string, loadMs: number, title = url, byUser = false): void {
    stopLoading(tab.id);
    const at = clock.now();
    Object.assign(tab, { url, title, completesAt: at + loadMs });
    loads.push({ tabId: tab.id, url, at, byUser, endedAt: at + loadMs });
  }

  function add(url: string, windowId: number, cookieStoreId?: string): FakeTab {
    const context = WINDOWS.get(windowId);
    if (!context) throw new Error(`No window with id: ${windowId}`);
    const tab: FakeTab = {
      id: nextId++,
      windowId,
      url,
      title: url,
      completesAt: clock.now(),
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
      return view(tab);
    },
    async query({ url }) {
      const prefix = url.replace(/\*$/, "");
      return [...tabs.values()]
        .filter((tab) => status(tab) === "complete" && tab.url.startsWith(prefix))
        .map(view);
    },
    async create({ url, active, windowId = 1, cookieStoreId }) {
      const tab = add(url, windowId, cookieStoreId);
      log.push(`create ${active ? "active" : "inactive"} ${url}`);
      load(tab, url, options.navigationMs());
      if (active) activate(tab.id);
      options.created(tab.id);
      return view(tab);
    },
    async update(tabId, { url, active }) {
      const tab = tabs.get(tabId);
      if (!tab) throw new Error(`No tab with id: ${tabId}`);
      if (url !== undefined) load(tab, url, options.navigationMs());
      log.push(`update ${tabId}${url === undefined ? "" : ` ${url}`}${active ? " active" : ""}`);
      if (active) activate(tabId);
      return view(tab);
    },
    async remove(tabId) {
      tabs.delete(tabId);
      log.push(`remove ${tabId}`);
      stopLoading(tabId);
    },
  };

  const windows: WindowsApi = {
    update: async (windowId) => {
      focused.push(windowId);
      return { id: windowId };
    },
  };

  return {
    api,
    windows,
    log,
    loads,
    focused,
    open(url: string, placement: { windowId?: number; cookieStoreId?: string } = {}): number {
      return add(url, placement.windowId ?? 1, placement.cookieStoreId).id;
    },
    set(tabId: number, change: Partial<Omit<FakeTab, "completesAt">>): void {
      const tab = tabs.get(tabId);
      if (tab) Object.assign(tab, change);
    },
    /** The user loads a page in the tab, for example when they solve a challenge. */
    navigate(tabId: number, change: { url?: string; title: string; loadMs?: number }): void {
      const tab = tabs.get(tabId);
      if (tab) load(tab, change.url ?? tab.url, change.loadMs ?? 0, change.title, true);
    },
    activate,
    get: (tabId: number): FakeTab | undefined => tabs.get(tabId),
    has: (tabId: number) => tabs.has(tabId),
    find: (url: string): number | undefined =>
      [...tabs.values()].find((tab) => tab.url === url)?.id,
  };
}

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
  readonly signal: AbortSignal;
  endedAt: number | null;
};

type Worker = { readonly fetcher: Fetcher; readonly stop: () => void };

/** Once a worker is stopped, nothing it calls ever answers, as when the browser kills it. */
function mortal(alive: () => boolean) {
  const never = new Promise<never>(() => {});
  return <Args extends unknown[], R>(call: (...args: Args) => Promise<R>) =>
    async (...args: Args): Promise<R> => {
      if (!alive()) return never;
      let result: R;
      try {
        result = await call(...args);
      } catch (error) {
        if (alive()) throw error;
        return never;
      }
      return alive() ? result : never;
    };
}

function mortalValue<T>(value: SessionValue<T>, wrap: ReturnType<typeof mortal>): SessionValue<T> {
  return { load: wrap(value.load), save: wrap(value.save) };
}

export function fakeExtension(options: {
  readonly pages: (
    request: PageRequest,
    signal: AbortSignal,
  ) => CollectedPage | Promise<CollectedPage>;
  readonly clock?: FakeClock;
  readonly throttleState?: SessionValue<ThrottleState>;
  readonly ownedTab?: SessionValue<OwnedTab>;
  readonly navigationMs?: () => number;
  readonly onTabCreated?: (tabId: number) => void;
  readonly gatedPicture?: (url: string) => Promise<PortPicture | null>;
  readonly publicPicture?: (url: URL) => Promise<PortPicture | null>;
}) {
  const clock = options.clock ?? fakeClock();
  const throttleState = options.throttleState ?? memoryValue(OPEN_THROTTLE);
  const ownedTab = options.ownedTab ?? memoryValue<OwnedTab>(null);
  const tabs = fakeTabs(clock, {
    activated: (tabId) => worker.fetcher.noteTabActivated(tabId),
    navigationMs: options.navigationMs ?? (() => 0),
    created: (tabId) => options.onTabCreated?.(tabId),
  });
  const myakiba: Requester = { tabId: tabs.open(`${ORIGINS.web}/sync`), context: NORMAL };
  const calls: CollectCall[] = [];
  const pictureUrls: string[] = [];

  async function collectPage(tabId: number, request: PageRequest, signal: AbortSignal) {
    const tab = tabs.get(tabId);
    const call: CollectCall = {
      ...request,
      tabId,
      tab: tab && { ...tab },
      at: clock.now(),
      signal,
      endedAt: null,
    };
    calls.push(call);
    try {
      return await options.pages(request, signal);
    } finally {
      call.endedAt = clock.now();
    }
  }

  function startWorker(): Worker {
    let alive = true;
    const wrap = mortal(() => alive);
    const fetcher = createFetcher({
      tabs: {
        get: wrap(tabs.api.get),
        query: wrap(tabs.api.query),
        create: wrap(tabs.api.create),
        update: wrap(tabs.api.update),
        remove: wrap(tabs.api.remove),
      },
      windows: { update: wrap(tabs.windows.update) },
      clock: { now: clock.now, sleep: wrap(clock.sleep) },
      random: () => 0.5,
      origins: ORIGINS,
      throttleState: mortalValue(throttleState, wrap),
      ownedTab: mortalValue(ownedTab, wrap),
      collectPage: wrap(collectPage),
      fetchGatedPicture: wrap(async (_tabId: number, url: string) => {
        pictureUrls.push(url);
        return options.gatedPicture
          ? options.gatedPicture(url)
          : { base64: "/9j/", contentType: "image/jpeg" };
      }),
      fetchPublicPicture: wrap(async (url: URL) => {
        pictureUrls.push(url.href);
        return options.publicPicture
          ? options.publicPicture(url)
          : { base64: "AQID", contentType: "image/jpeg" };
      }),
    });
    return {
      fetcher,
      stop: () => {
        alive = false;
      },
    };
  }

  let worker = startWorker();

  function run(ids: readonly number[], requester: Requester = myakiba) {
    const key = crypto.randomUUID() as RunKey;
    const events: RunEvent<PortPicture>[] = [];
    worker.fetcher.submit({
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

  return {
    clock,
    tabs,
    myakiba,
    calls,
    pictureUrls,
    get fetcher() {
      return worker.fetcher;
    },
    run,
    settle: clock.runUntilIdle,
    loads(): readonly Load[] {
      const fetches = calls
        .filter((call) => call.mode === "fetch")
        .map((call) => ({
          tabId: call.tabId,
          url: `${ORIGINS.mfc}/item/${call.mfcItemId}`,
          at: call.at,
          byUser: false,
          endedAt: call.endedAt,
        }));
      return [...tabs.loads, ...fetches].toSorted((a, b) => a.at - b.at);
    },
    /** The browser stops the worker and starts a new one, which resumes as the background does. */
    restart(): void {
      worker.stop();
      worker = startWorker();
      worker.fetcher.resume();
    },
  };
}

export type FakeExtension = ReturnType<typeof fakeExtension>;
