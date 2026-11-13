import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import path from "node:path";
import { chromium } from "playwright";
import type { BrowserContext, Page } from "playwright";
import {
  DEFAULT_SCENARIO,
  E2E_ORIGINS,
  ELSEWHERE_PICTURE_ID,
  GATED_ID,
  MOVED_PICTURE_ID,
  NO_CONTENT_PICTURE_ID,
  PICTURE_SHA256,
  PUBLIC_ID,
  UNLISTED_ORIGIN,
  startMocks,
} from "./mock-mfc";

const EXTENSION = path.join(import.meta.dir, "../.output/chrome-mv3-e2e");
const MFC = E2E_ORIGINS.WXT_MFC_ORIGIN;
const SCENARIO_TIMEOUT_MS = 60_000;
const SLOW_ITEM_MS = 1000;
const STALLED_ITEM_MS = 8000;

type PageItem = {
  readonly mfcItemId: number;
  readonly ok: boolean;
  readonly error: string | null;
  readonly html: string | null;
  readonly picture: {
    readonly isArrayBuffer: boolean;
    readonly byteLength: number;
    readonly contentType: string;
    readonly sha256: string;
  } | null;
};
type TakenPick = {
  readonly captureId: string;
  readonly mfcItemId: number;
  readonly pictureBytes: number | null;
};
type PageRun = { readonly items: readonly PageItem[]; readonly reason: string };
type Bridge = {
  readonly statuses: readonly { readonly state: string }[];
  readonly start: (ids: readonly number[]) => string;
  readonly cancel: (requestId: string) => void;
  readonly events: (
    requestId: string,
  ) => readonly { readonly type: string; readonly reason?: string }[];
  readonly announces: () => number;
  readonly hello: (timeoutMs: number) => Promise<{ readonly type: string } | null>;
  readonly fetchItems: (ids: readonly number[]) => Promise<PageRun>;
  readonly rogue: (waitMs: number) => Promise<number>;
  readonly takePicks: () => Promise<readonly TakenPick[]>;
  readonly picksSaved: (captureIds: readonly string[]) => Promise<string>;
};
type WorkerTabs = {
  readonly query: (filter: {
    readonly url: string;
  }) => Promise<readonly { readonly status?: string }[]>;
};
type StoredPick = {
  readonly html: string;
  readonly title: string | null;
  readonly picture: { readonly base64: string; readonly contentType: string } | null;
};
type WorkerStorage = {
  readonly get: (key: string | null) => Promise<Readonly<Record<string, StoredPick | undefined>>>;
};
declare global {
  var bridge: Bridge;
  var chrome: { readonly tabs: WorkerTabs; readonly storage: { readonly local: WorkerStorage } };
  var messagesToPage: unknown[];
}

const mocks = startMocks();
let context: BrowserContext;
let openedPages: Page[] = [];

beforeAll(() => {
  const build = Bun.spawnSync(["bunx", "wxt", "build", "--mode", "e2e"], {
    cwd: path.join(import.meta.dir, ".."),
    env: { ...process.env, ...E2E_ORIGINS },
  });
  if (build.exitCode !== 0) throw new Error(`the e2e build failed\n${build.stderr.toString()}`);
});

afterEach(async () => {
  await context.close();
  Object.assign(mocks.scenario, DEFAULT_SCENARIO);
  mocks.requests.length = 0;
});

afterAll(() => mocks.stop());

async function launch(): Promise<Page> {
  context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
  });
  if (context.serviceWorkers().length === 0) await context.waitForEvent("serviceworker");
  openedPages = [];
  context.on("page", (opened) => {
    openedPages.push(opened);
  });
  const myakiba = context.pages()[0] ?? (await context.newPage());
  await myakiba.goto(`${E2E_ORIGINS.WXT_WEB_ORIGIN}/`);
  const announce = await myakiba.evaluate(() => globalThis.bridge.hello(5000));
  expect(announce?.type).toBe("announce");
  return myakiba;
}

function openedUrls(): string[] {
  return openedPages.map((page) => page.url());
}

function mfcTabs(): Page[] {
  return context.pages().filter((page) => page.url().startsWith(MFC));
}

async function until(condition: () => boolean, label: string, timeoutMs = 10_000) {
  for (const deadline = Date.now() + timeoutMs; Date.now() < deadline;) {
    if (condition()) return;
    await Bun.sleep(50);
  }
  throw new Error(`timed out waiting for ${label}`);
}

async function untilExtensionSeesMfcTabComplete() {
  const [worker] = context.serviceWorkers();
  for (const deadline = Date.now() + 10_000; Date.now() < deadline;) {
    const complete = await worker?.evaluate(async (origin) => {
      const tabs = await chrome.tabs.query({ url: `${origin}/*` });
      return tabs.length > 0 && tabs.every((tab) => tab.status === "complete");
    }, MFC);
    if (complete) return;
    await Bun.sleep(50);
  }
  throw new Error("timed out waiting for the extension to see the MFC tab complete");
}

function fetchItems(myakiba: Page, ids: readonly number[]): Promise<PageRun> {
  return myakiba.evaluate((mfcItemIds) => globalThis.bridge.fetchItems(mfcItemIds), ids);
}

describe("the extension against a mock MFC", () => {
  test(
    "public pictures require browsing the static origin, reach the page intact and are asked of the CDN once",
    async () => {
      const myakiba = await launch();
      const url = `${E2E_ORIGINS.WXT_MFC_STATIC_ORIGIN}/upload/items/1/${PUBLIC_ID}-a1b2c.jpg`;
      const [worker] = context.serviceWorkers();
      const background = await worker?.evaluate(async (pictureUrl) => {
        const response = await fetch(pictureUrl, { credentials: "omit", cache: "no-store" });
        return { status: response.status, mitigated: response.headers.get("cf-mitigated") };
      }, url);
      expect(background).toEqual({ status: 403, mitigated: "challenge" });
      mocks.requests.length = 0;

      const run = await fetchItems(myakiba, [PUBLIC_ID]);
      expect(run.items[0]?.ok).toBe(true);
      expect(run.items[0]?.picture?.sha256).toBe(PICTURE_SHA256.public);
      const pictures = mocks.requests.filter(
        (request) =>
          request.origin === E2E_ORIGINS.WXT_MFC_STATIC_ORIGIN &&
          request.path === new URL(url).pathname,
      );
      expect(pictures.map((request) => request.mode)).toEqual(["navigate"]);
      await until(
        () =>
          context.pages().every((tab) => !tab.url().startsWith(E2E_ORIGINS.WXT_MFC_STATIC_ORIGIN)),
        "the owned static tab to close",
      );
    },
    SCENARIO_TIMEOUT_MS,
  );

  test(
    "a public picture the CDN redirects to another picture is sent as none, and its tab still closes",
    async () => {
      const myakiba = await launch();

      const run = await fetchItems(myakiba, [MOVED_PICTURE_ID]);

      expect(run.items.map((item) => [item.ok, item.picture])).toEqual([[true, null]]);
      expect(mocks.requests.map((request) => request.path)).toContain(
        `/upload/items/1/${PUBLIC_ID}-a1b2c.jpg`,
      );
      await until(
        () =>
          context.pages().every((tab) => !tab.url().startsWith(E2E_ORIGINS.WXT_MFC_STATIC_ORIGIN)),
        "the owned static tab to close",
      );
    },
    SCENARIO_TIMEOUT_MS,
  );

  test.each([
    ["answers 204", NO_CONTENT_PICTURE_ID],
    ["redirects to a site the extension cannot read", ELSEWHERE_PICTURE_ID],
  ])(
    "a public picture whose CDN %s is sent as none, and every tab the extension opened closes",
    async (_name, id) => {
      const myakiba = await launch();

      const run = await fetchItems(myakiba, [id]);

      expect(run.items.map((item) => [item.ok, item.picture])).toEqual([[true, null]]);
      expect(mocks.requests.map((request) => request.path)).toContain(
        `/upload/items/1/${id}-a1b2c.jpg`,
      );
      await until(
        () => context.pages().length === 1 && context.pages()[0] === myakiba,
        "every tab the extension opened to close",
      );
    },
    SCENARIO_TIMEOUT_MS,
  );

  test(
    "a cold fetch opens a tab of its own, carries the gated picture intact and closes the tab",
    async () => {
      const myakiba = await launch();
      expect(mfcTabs()).toHaveLength(0);

      const run = await fetchItems(myakiba, [GATED_ID]);
      const [item] = run.items;

      expect(run.reason).toBe("complete");
      expect(item?.ok).toBe(true);
      expect(item?.picture).toEqual({
        isArrayBuffer: true,
        byteLength: 256 * 1024 + 6,
        contentType: "image/jpeg",
        sha256: PICTURE_SHA256.gated,
      });
      expect(item?.html).toContain(
        '<link rel="canonical" href="https://myfigurecollection.net/item/98777">',
      );
      expect(item?.html).not.toContain("fixture_user");
      expect(openedUrls()).toEqual([`${MFC}/`]);
      await until(() => mfcTabs().length === 0, "the owned tab to close");
    },
    SCENARIO_TIMEOUT_MS,
  );

  test(
    "a warm fetch reuses the open MFC tab and leaves it open",
    async () => {
      const myakiba = await launch();
      const open = await context.newPage();
      await open.goto(`${MFC}/`);
      await untilExtensionSeesMfcTabComplete();
      await myakiba.bringToFront();
      openedPages = [];

      const run = await fetchItems(myakiba, [GATED_ID]);

      expect(run.items[0]?.picture?.sha256).toBe(PICTURE_SHA256.gated);
      expect(openedUrls()).toEqual([]);
      expect(mfcTabs()).toEqual([open]);
    },
    SCENARIO_TIMEOUT_MS,
  );

  test(
    "a slow MFC's page loads end at least 2.5 s before the next starts, and a public picture comes from the static origin",
    async () => {
      mocks.scenario.itemDelayMs = SLOW_ITEM_MS;
      const myakiba = await launch();

      const run = await fetchItems(myakiba, [GATED_ID, PUBLIC_ID]);
      const [first, second] = mocks.itemRequests();
      const gapMs = (second?.at ?? 0) - (first?.endedAt ?? Infinity);
      console.info(`throttle gap from one page load's end to the next one's start: ${gapMs} ms`);

      expect(mocks.itemRequests().map((request) => request.path)).toEqual([
        `/item/${GATED_ID}`,
        `/item/${PUBLIC_ID}`,
      ]);
      expect(gapMs).toBeGreaterThanOrEqual(2500);
      expect(run.items.map((item) => item.picture?.sha256)).toEqual([
        PICTURE_SHA256.gated,
        PICTURE_SHA256.public,
      ]);
      expect(mocks.requests.map((request) => request.origin)).toContain(
        E2E_ORIGINS.WXT_MFC_STATIC_ORIGIN,
      );
    },
    SCENARIO_TIMEOUT_MS,
  );

  test(
    "a cancel mid-load ends the MFC request in the tab, and the next item starts 2.5 s after it ended",
    async () => {
      mocks.scenario.itemDelayMs = STALLED_ITEM_MS;
      const myakiba = await launch();

      const cancelled = await myakiba.evaluate((id) => globalThis.bridge.start([id]), GATED_ID);
      await until(() => mocks.itemRequests().length === 1, "the first item request", 20_000);
      await Bun.sleep(1000);
      const cancelledAt = Date.now();
      await myakiba.evaluate((requestId) => globalThis.bridge.cancel(requestId), cancelled);
      const next = await fetchItems(myakiba, [PUBLIC_ID]);

      const [first, second] = mocks.itemRequests();
      const endedAfterCancelMs = (first?.endedAt ?? Infinity) - cancelledAt;
      const gapMs = (second?.at ?? 0) - (first?.endedAt ?? Infinity);
      console.info(
        `cancelled request aborted: ${first?.aborted}, ended ${endedAfterCancelMs} ms after the cancel; next request ${gapMs} ms after it ended`,
      );

      expect(mocks.itemRequests().map((request) => request.path)).toEqual([
        `/item/${GATED_ID}`,
        `/item/${PUBLIC_ID}`,
      ]);
      expect(endedAfterCancelMs).toBeLessThan(STALLED_ITEM_MS - 1000);
      expect(gapMs).toBeGreaterThanOrEqual(2500);
      expect(next.items.map((item) => item.ok)).toEqual([true]);
      expect(
        await myakiba.evaluate((requestId) => globalThis.bridge.events(requestId), cancelled),
      ).toContainEqual({ type: "done", reason: "cancelled" });
    },
    SCENARIO_TIMEOUT_MS,
  );

  test(
    "a challenge waits for a click in the tab it shows, then completes and leaves that tab to the user",
    async () => {
      mocks.scenario.challenge = true;
      const myakiba = await launch();

      const running = fetchItems(myakiba, [GATED_ID]);
      await until(
        () => mfcTabs().some((tab) => tab.url().endsWith(`/item/${GATED_ID}`)),
        "the challenge tab",
        20_000,
      );
      const challengeTab = mfcTabs().find((tab) => tab.url().endsWith(`/item/${GATED_ID}`));
      if (!challengeTab) throw new Error("no challenge tab");
      await challengeTab.locator("#solve").click();
      const run = await running;

      expect(
        await myakiba.evaluate(() => globalThis.bridge.statuses.map((status) => status.state)),
      ).toContain("needs_user");
      expect(run.items[0]?.ok).toBe(true);
      expect(run.items[0]?.picture?.sha256).toBe(PICTURE_SHA256.gated);

      const next = await fetchItems(myakiba, [PUBLIC_ID]);
      expect(next.items[0]?.picture?.sha256).toBe(PICTURE_SHA256.public);
      await until(
        () =>
          context.pages().every((tab) => !tab.url().startsWith(E2E_ORIGINS.WXT_MFC_STATIC_ORIGIN)),
        "the owned static tab to close",
      );
      expect(mfcTabs()).toEqual([challengeTab]);
    },
    SCENARIO_TIMEOUT_MS,
  );

  test(
    "a signed-out MFC session gives mfc_signed_out",
    async () => {
      mocks.scenario.signedIn = false;
      const myakiba = await launch();

      const run = await fetchItems(myakiba, [GATED_ID]);

      expect(run.items).toEqual([
        { mfcItemId: GATED_ID, ok: false, error: "mfc_signed_out", html: null, picture: null },
      ]);
    },
    SCENARIO_TIMEOUT_MS,
  );

  test(
    "a page on an unlisted origin, and the real page framed in it, get no content script",
    async () => {
      await launch();
      const unlisted = await context.newPage();
      await unlisted.goto(`${UNLISTED_ORIGIN}/`);

      const answer = await unlisted.evaluate(() => globalThis.bridge.hello(2000));
      await unlisted.evaluate(
        (src) =>
          new Promise((resolve) => {
            const frame = document.createElement("iframe");
            frame.addEventListener("load", resolve);
            frame.src = src;
            document.body.append(frame);
          }),
        `${E2E_ORIGINS.WXT_WEB_ORIGIN}/`,
      );
      const framed = unlisted
        .frames()
        .find((frame) => frame.url().startsWith(E2E_ORIGINS.WXT_WEB_ORIGIN));
      const framedAnswer = await framed?.evaluate(() => globalThis.bridge.hello(2000));

      expect(answer).toBeNull();
      expect(await unlisted.evaluate(() => globalThis.bridge.announces())).toBe(0);
      expect(framed).toBeDefined();
      expect(framedAnswer).toBeNull();
      expect(await framed?.evaluate(() => globalThis.bridge.announces())).toBe(0);
    },
    SCENARIO_TIMEOUT_MS,
  );

  test(
    "a fetch-url message is ignored",
    async () => {
      const myakiba = await launch();

      const answers = await myakiba.evaluate(() => globalThis.bridge.rogue(2000));

      expect(answers).toBe(0);
      expect(mocks.requests).toEqual([]);
      expect(openedUrls()).toEqual([]);
    },
    SCENARIO_TIMEOUT_MS,
  );
});
