import type { PortPicture, RunEvent } from "@myakiba/mfc/bridge";
import { mfcItemId } from "@myakiba/mfc/page";
import type { MfcItemId } from "@myakiba/mfc/page";
import type { Clock, SessionValue } from "../lib/clock";
import type { CollectedPage, PageRequest } from "../lib/collect";
import { createFetcher } from "../lib/fetcher";
import type { Fetcher } from "../lib/fetcher";
import type { WindowsApi } from "../lib/mfc-tab";
import type { Origins } from "../lib/origins";
import type { OwnedTab, Tab, TabsApi } from "../lib/owned-tab";
import { pictureToRead } from "../lib/picture";
import type { Requester, RunKey, TabContext } from "../lib/queue";
import { OPEN_THROTTLE } from "../lib/throttle";
import type { ThrottleState } from "../lib/throttle";

export const ORIGINS: Origins = {
  web: "http://myakiba.test",
  mfc: "http://mfc.test",
  mfcStatic: "http://static.mfc.test",
};

/** The manifest's host permissions. The browser hides the URL and title of a page anywhere else. */
const HOST_ORIGINS = new Set([ORIGINS.mfc, ORIGINS.mfcStatic]);

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
  /** The page the tab shows once its load completes. */
  url: string;
  /** The page the tab showed before its load. */
  committedUrl: string;
  /** Where the load is going, which Chrome shows as `pendingUrl`. */
  destination: string;
  title: string;
  completesAt: number;
  /** Polls left in which a Firefox tab calls itself complete before its load starts. */
  idlePolls: number;
  active: boolean;
  incognito: boolean;
  cookieStoreId?: string;
};

export type Load = {
  readonly tabId: number;
  readonly url: string;
  readonly at: number;
  readonly byUser: boolean;
  /** The page load a read in the tab belongs to, as one throttle turn. */
  readonly within?: Load;
  endedAt: number | null;
};

/**
 * Loads the extension started before every earlier load had ended `gapMs` ago. The user may load a page any time,
 * and a read may follow the page load it belongs to at once, when nothing else ended in between.
 */
export function tooClose(loads: readonly Load[], gapMs: number) {
  const tooSoon: { readonly after: Load; readonly load: Load }[] = [];
  let latest: Load | null = null;
  for (const load of loads) {
    const continues =
      load.within !== undefined &&
      load.within === latest &&
      load.at >= (latest.endedAt ?? Infinity);
    if (latest && !load.byUser && !continues && load.at - (latest.endedAt ?? Infinity) < gapMs) {
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

/**
 * How a load shows before it commits. By default it commits at once. Chrome shows the old page as `url` and the new one as
 * `pendingUrl`. Firefox has no `pendingUrl`, so it shows only the old page, which is a blank one in a new tab. Firefox may
 * also call the tab complete, still on the old page, for a few polls before the load starts.
 */
export type CommitStyle = "chrome" | "firefox" | "firefox-late";

export const COMMIT_STYLES: readonly (readonly [string, CommitStyle | undefined])[] = [
  ["at once", undefined],
  ["Chrome-style", "chrome"],
  ["Firefox-style", "firefox"],
  ["Firefox-style, complete before it starts", "firefox-late"],
];

const IDLE_POLLS = 3;

function readable(url: string): boolean {
  const origin = URL.parse(url)?.origin;
  return origin !== undefined && HOST_ORIGINS.has(origin);
}

/** Activating a tab runs the onActivated listener before the call returns, as Chrome does. */
function fakeTabs(
  clock: Clock,
  options: {
    readonly activated: (tabId: number) => Promise<void>;
    readonly navigationMs: () => number;
    readonly created: (tabId: number) => void;
    readonly deferNavigationCommit: CommitStyle | undefined;
    readonly redirect: ((url: string) => string | undefined) | undefined;
    readonly dropsNavigation: ((url: string) => boolean) | undefined;
  },
) {
  const tabs = new Map<number, FakeTab>();
  const removed = new Map<number, PromiseWithResolvers<null>>();
  const dragged = new Set<number>();
  const log: string[] = [];
  const loads: Load[] = [];
  const focused: number[] = [];
  const raised: number[] = [];
  let nextId = 100;
  const showsPending =
    options.deferNavigationCommit === undefined || options.deferNavigationCommit === "chrome";

  function status(tab: FakeTab): string {
    return clock.now() >= tab.completesAt ? "complete" : "loading";
  }

  function seen(tab: FakeTab): Tab {
    const { id, windowId, active, incognito, cookieStoreId } = tab;
    return cookieStoreId === undefined
      ? { id, windowId, active, incognito }
      : { id, windowId, active, incognito, cookieStoreId };
  }

  function view(tab: FakeTab): Tab {
    const loading = clock.now() < tab.completesAt;
    const style = loading ? options.deferNavigationCommit : undefined;
    const shown = style === undefined ? tab.url : tab.committedUrl;
    let shownTab: Tab = { ...seen(tab), status: loading ? "loading" : "complete" };
    if (readable(shown)) shownTab = { ...shownTab, url: shown, title: tab.title };
    if (style === "chrome" && readable(tab.destination)) {
      shownTab = { ...shownTab, pendingUrl: tab.destination };
    }
    return shownTab;
  }

  function idleView(tab: FakeTab): Tab {
    const idle: Tab = { ...seen(tab), status: "complete" };
    return readable(tab.committedUrl) ? { ...idle, url: tab.committedUrl } : idle;
  }

  /** Create and update answer before their load commits, even when the fake commits at once. */
  function started(tab: FakeTab): Tab {
    let answer: Tab = { ...seen(tab), status: "loading" };
    if (readable(tab.committedUrl)) answer = { ...answer, url: tab.committedUrl };
    if (showsPending && readable(tab.destination)) {
      answer = { ...answer, pendingUrl: tab.destination };
    }
    return answer;
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

  /** A dropped load, such as a 204 or a download, ends on the page the tab showed before it. */
  function load(tab: FakeTab, url: string, loadMs: number, title = url, byUser = false): void {
    const committedUrl = status(tab) === "complete" ? tab.url : tab.committedUrl;
    stopLoading(tab.id);
    const at = clock.now();
    const destination = options.redirect?.(url) ?? url;
    const dropped = options.dropsNavigation?.(url) === true;
    Object.assign(tab, {
      committedUrl,
      destination,
      url: dropped ? committedUrl : destination,
      title: dropped ? tab.title : title,
      completesAt: at + loadMs,
      idlePolls: options.deferNavigationCommit === "firefox-late" && !byUser ? IDLE_POLLS : 0,
    });
    loads.push({ tabId: tab.id, url, at, byUser, endedAt: at + loadMs });
  }

  function add(url: string, windowId: number, cookieStoreId?: string): FakeTab {
    const context = WINDOWS.get(windowId);
    if (!context) throw new Error(`No window with id: ${windowId}`);
    const tab: FakeTab = {
      id: nextId++,
      windowId,
      url,
      committedUrl: url,
      destination: url,
      title: url,
      completesAt: clock.now(),
      idlePolls: 0,
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
      if (tab.idlePolls === 0) return view(tab);
      tab.idlePolls -= 1;
      return idleView(tab);
    },
    async query({ url }) {
      const prefix = url.replace(/\*$/, "");
      return [...tabs.values()]
        .filter((tab) => status(tab) === "complete" && tab.url.startsWith(prefix))
        .map(view);
    },
    async create({ url, active, windowId = 1, cookieStoreId }) {
      const tab = add("about:blank", windowId, cookieStoreId);
      log.push(`create ${active ? "active" : "inactive"} ${url}`);
      load(tab, url, options.navigationMs());
      const answer = started(tab);
      if (active) activate(tab.id);
      options.created(tab.id);
      return answer;
    },
    async update(tabId, { url, active }) {
      const tab = tabs.get(tabId);
      if (!tab) throw new Error(`No tab with id: ${tabId}`);
      if (url !== undefined) load(tab, url, options.navigationMs());
      const answer = url === undefined ? view(tab) : started(tab);
      log.push(`update ${tabId}${url === undefined ? "" : ` ${url}`}${active ? " active" : ""}`);
      if (active) {
        raised.push(tabId);
        activate(tabId);
      }
      return answer;
    },
    async remove(tabId) {
      if (dragged.has(tabId)) {
        throw new Error("Tabs cannot be edited right now (user may be dragging a tab).");
      }
      tabs.delete(tabId);
      log.push(`remove ${tabId}`);
      stopLoading(tabId);
      removed.get(tabId)?.resolve(null);
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
    /** Tabs the extension brought to the front. */
    raised,
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
    /** While the user drags a tab, Chrome refuses to close it. */
    drag(tabId: number, dragging: boolean): void {
      if (dragging) dragged.add(tabId);
      else dragged.delete(tabId);
    },
    /** Settles once the tab closes, which ends any script running in it. */
    closed(tabId: number): Promise<null> {
      const closing = removed.get(tabId) ?? Promise.withResolvers<null>();
      removed.set(tabId, closing);
      if (!tabs.has(tabId)) closing.resolve(null);
      return closing.promise;
    },
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
  readonly ownedPictureTab?: SessionValue<OwnedTab>;
  readonly navigationMs?: () => number;
  readonly onTabCreated?: (tabId: number) => void;
  readonly deferNavigationCommit?: CommitStyle | undefined;
  readonly redirect?: (url: string) => string | undefined;
  readonly dropsNavigation?: (url: string) => boolean;
  /** The collector's fetch in the MFC tab. Aborting its signal stops it, as the stop injection does. */
  readonly gatedPicture?: (url: string, signal: AbortSignal) => Promise<PortPicture | null>;
  /** The collector's fetch in the picture tab. Aborting its signal stops it, as the stop injection does. */
  readonly publicPicture?: (url: URL, signal: AbortSignal) => Promise<PortPicture | null>;
}) {
  const clock = options.clock ?? fakeClock();
  const throttleState = options.throttleState ?? memoryValue(OPEN_THROTTLE);
  const ownedTab = options.ownedTab ?? memoryValue<OwnedTab>(null);
  const ownedPictureTab = options.ownedPictureTab ?? memoryValue<OwnedTab>(null);
  const tabs = fakeTabs(clock, {
    activated: (tabId) => worker.fetcher.noteTabActivated(tabId),
    navigationMs: options.navigationMs ?? (() => 0),
    created: (tabId) => options.onTabCreated?.(tabId),
    deferNavigationCommit: options.deferNavigationCommit,
    redirect: options.redirect,
    dropsNavigation: options.dropsNavigation,
  });
  const myakiba: Requester = { tabId: tabs.open(`${ORIGINS.web}/sync`), context: NORMAL };
  const calls: CollectCall[] = [];
  const pictureUrls: string[] = [];
  const publicPictureCalls: {
    readonly tabId: number;
    readonly signal: AbortSignal;
    readonly tab: Readonly<FakeTab> | undefined;
  }[] = [];
  const pictureReads: Load[] = [];

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

  /** A read in a tab ends once it answers, once its signal stops it, or once its tab closes. */
  async function readIn(
    read: Load,
    signal: AbortSignal,
    answer: () => Promise<PortPicture | null>,
  ): Promise<PortPicture | null> {
    pictureReads.push(read);
    const stopped = Promise.withResolvers<null>();
    signal.addEventListener("abort", () => stopped.resolve(null), { once: true });
    try {
      return await Promise.race([answer(), stopped.promise, tabs.closed(read.tabId)]);
    } finally {
      read.endedAt = clock.now();
    }
  }

  /** Stands in for the collector, which reads only the picture asked for. */
  async function readPublicPicture(tabId: number, requested: string, signal: AbortSignal) {
    signal.throwIfAborted();
    const tab = tabs.get(tabId);
    publicPictureCalls.push({ tabId, signal, tab: tab && { ...tab } });
    const url = new URL(tab?.url ?? "about:blank");
    pictureUrls.push(url.href);
    const within = tabs.loads.findLast((load) => load.tabId === tabId);
    const read: Load = {
      tabId,
      url: url.href,
      at: clock.now(),
      byUser: false,
      endedAt: null,
      ...(within && { within }),
    };
    return readIn(read, signal, async () => {
      if (!pictureToRead(requested, url.href, ORIGINS)) return null;
      return options.publicPicture
        ? options.publicPicture(url, signal)
        : { base64: "AQID", contentType: "image/jpeg" };
    });
  }

  async function readGatedPicture(tabId: number, url: string, signal: AbortSignal) {
    signal.throwIfAborted();
    pictureUrls.push(url);
    const read: Load = { tabId, url, at: clock.now(), byUser: false, endedAt: null };
    return readIn(read, signal, async () =>
      options.gatedPicture
        ? options.gatedPicture(url, signal)
        : { base64: "/9j/", contentType: "image/jpeg" },
    );
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
      ownedPictureTab: mortalValue(ownedPictureTab, wrap),
      collectPage: wrap(collectPage),
      fetchGatedPicture: wrap(readGatedPicture),
      fetchPublicPicture: wrap(readPublicPicture),
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
    publicPictureCalls,
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
      return [...tabs.loads, ...fetches, ...pictureReads].toSorted((a, b) => a.at - b.at);
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
