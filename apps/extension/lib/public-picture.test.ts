import { describe, expect, test } from "bun:test";
import type { PortPicture } from "@myakiba/mfc/bridge";
import {
  COMMIT_STYLES,
  ORIGINS,
  fakeExtension,
  itemPage,
  memoryValue,
  page,
  tooClose,
} from "../test/fake-browser";
import type { OwnedTab } from "./owned-tab";
import { PICTURE_TIMEOUT_MS } from "./picture";
import { OPEN_THROTTLE, THROTTLE } from "./throttle";

const PICTURE: PortPicture = { base64: "AQID", contentType: "image/jpeg" };
const publicPages = ({ mfcItemId }: { readonly mfcItemId: number }) =>
  page(itemPage(mfcItemId, "public"));
const pictureUrl = (id: number) => `${ORIGINS.mfcStatic}/upload/items/1/${id}.jpg`;
const picturesOf = (results: readonly { readonly ok: boolean; readonly picture?: unknown }[]) =>
  results.map((result) => result.ok && result.picture);
const extensionTabsLeft = (extension: ReturnType<typeof fakeExtension>) =>
  extension.tabs.loads
    .filter((load) => !load.byUser && extension.tabs.has(load.tabId))
    .map((load) => load.tabId);

describe("public pictures in an owned static tab", () => {
  test.each(COMMIT_STYLES)(
    "reuses one owned picture tab, never navigates borrowed tabs, and spaces every load (%s commits)",
    async (_name, style) => {
      const extension = fakeExtension({
        pages: publicPages,
        navigationMs: () => 1500,
        deferNavigationCommit: style,
      });
      const mfc = extension.tabs.open(`${ORIGINS.mfc}/`);
      const staticTab = extension.tabs.open(pictureUrl(99));
      const run = extension.run([1, 2, 3]);
      await extension.settle();

      expect(run.results().map((result) => result.ok && result.picture)).toEqual([
        PICTURE,
        PICTURE,
        PICTURE,
      ]);
      const pictures = extension.tabs.loads.filter((load) =>
        load.url.startsWith(ORIGINS.mfcStatic),
      );
      expect(pictures.map((load) => load.url)).toEqual([
        pictureUrl(1),
        pictureUrl(2),
        pictureUrl(3),
      ]);
      expect(new Set(pictures.map((load) => load.tabId)).size).toBe(1);
      expect(extension.publicPictureCalls.map((call) => call.tabId)).toEqual(
        pictures.map((load) => load.tabId),
      );
      expect(tooClose(extension.loads(), THROTTLE.minGapMs)).toEqual([]);
      expect(
        extension.tabs.loads.some((load) => load.tabId === mfc || load.tabId === staticTab),
      ).toBe(false);
      expect(extension.tabs.has(mfc)).toBe(true);
      expect(extension.tabs.has(staticTab)).toBe(true);
      expect(pictures.every((load) => !extension.tabs.has(load.tabId))).toBe(true);
    },
  );

  test("a picture read holds the throttle until it ends, so the next page loads 2.5 s after it", async () => {
    const extension = fakeExtension({
      pages: publicPages,
      publicPicture: async (_url, signal) => {
        await extension.clock.sleep(8000, signal);
        return PICTURE;
      },
    });
    const run = extension.run([1, 2]);
    await extension.settle();

    expect(run.results().map((result) => result.ok && result.picture)).toEqual([PICTURE, PICTURE]);
    const firstRead = extension.loads().find((load) => load.within !== undefined);
    const secondPage = extension.calls.find((call) => call.mfcItemId === 2);
    expect((secondPage?.at ?? 0) - (firstRead?.endedAt ?? Infinity)).toBeGreaterThanOrEqual(
      THROTTLE.minGapMs,
    );
    expect(tooClose(extension.loads(), THROTTLE.minGapMs)).toEqual([]);
  });

  test("cancelling a picture read stops it in the tab, and the next run's page waits 2.5 s after that", async () => {
    const extension = fakeExtension({
      pages: publicPages,
      publicPicture: () => new Promise(() => {}),
    });
    const cancelled = extension.run([1]);
    await extension.clock.runUntil(() => extension.publicPictureCalls.length === 1);
    await extension.clock.runUntil(() => extension.clock.now() >= 1_010_000);
    extension.fetcher.cancel(cancelled.key);
    const cancelledAt = extension.clock.now();
    const next = extension.run([2]);
    await extension.settle();

    const read = extension.loads().find((load) => load.within !== undefined);
    expect(read?.endedAt).toBe(cancelledAt);
    const nextPage = extension.calls.find((call) => call.mfcItemId === 2);
    expect((nextPage?.at ?? 0) - cancelledAt).toBeGreaterThanOrEqual(THROTTLE.minGapMs);
    expect(next.results().map((result) => result.ok)).toEqual([true]);
    expect(tooClose(extension.loads(), THROTTLE.minGapMs)).toEqual([]);
  });

  test.each(COMMIT_STYLES)(
    "a picture the CDN redirects within its origin is still the extension's tab, used again and closed (%s commits)",
    async (_name, style) => {
      const moved = `${ORIGINS.mfcStatic}/upload/items/1/1-moved.jpg`;
      const extension = fakeExtension({
        pages: publicPages,
        navigationMs: () => 1500,
        redirect: (url) => (url === pictureUrl(1) ? moved : undefined),
        deferNavigationCommit: style,
      });
      const run = extension.run([1, 2]);
      await extension.settle();

      expect(run.results().map((result) => result.ok)).toEqual([true, true]);
      const pictureTabs = extension.tabs.loads
        .filter((load) => load.url.startsWith(ORIGINS.mfcStatic))
        .map((load) => load.tabId);
      expect(pictureTabs).toHaveLength(2);
      expect(new Set(pictureTabs).size).toBe(1);
      expect(extension.publicPictureCalls.map((call) => call.tab?.url)).toEqual([
        moved,
        pictureUrl(2),
      ]);
      expect(extension.tabs.loads.every((load) => !extension.tabs.has(load.tabId))).toBe(true);
    },
  );

  test("a stalled navigation times out as a missing picture and stops before the next load", async () => {
    const extension = fakeExtension({
      pages: ({ mfcItemId }) => page(itemPage(mfcItemId, mfcItemId === 1 ? "public" : null)),
      navigationMs: () => PICTURE_TIMEOUT_MS + 60_000,
    });
    extension.tabs.open(`${ORIGINS.mfc}/`);
    const startedAt = extension.clock.now();
    const run = extension.run([1, 2]);
    await extension.settle();

    expect(run.results().map((result) => result.ok && result.picture)).toEqual([null, null]);
    expect(extension.clock.now() - startedAt).toBeLessThan(PICTURE_TIMEOUT_MS + 10_000);
    expect(extension.publicPictureCalls).toEqual([]);
    expect(tooClose(extension.loads(), THROTTLE.minGapMs)).toEqual([]);
    expect(extension.tabs.loads.every((load) => !extension.tabs.has(load.tabId))).toBe(true);
  });

  test("a stalled collector times out without blocking the following item", async () => {
    const extension = fakeExtension({
      pages: publicPages,
      publicPicture: () => new Promise(() => {}),
    });
    const run = extension.run([1, 2]);
    await extension.settle();

    expect(run.results().map((result) => result.ok && result.picture)).toEqual([null, null]);
    expect(extension.publicPictureCalls).toHaveLength(2);
    expect(extension.publicPictureCalls.every((call) => call.signal.aborted)).toBe(true);
    expect(tooClose(extension.loads(), THROTTLE.minGapMs)).toEqual([]);
  });

  test("cancelling a picture navigation closes it before another run loads a page", async () => {
    let navigation = 0;
    const extension = fakeExtension({
      pages: publicPages,
      navigationMs: () => (navigation++ === 0 ? 60_000 : 0),
    });
    const borrowed = extension.tabs.open(`${ORIGINS.mfc}/`);
    const cancelled = extension.run([1]);
    await extension.clock.runUntil(() => extension.tabs.loads.length === 1);
    extension.fetcher.cancel(cancelled.key);
    const next = extension.run([2]);
    await extension.settle();

    expect(cancelled.events.at(-1)).toEqual({ type: "done", reason: "cancelled" });
    expect(cancelled.items()).toEqual([]);
    expect(extension.pictureUrls).toEqual([pictureUrl(2)]);
    expect(next.results().map((result) => result.ok && result.picture)).toEqual([PICTURE]);
    expect(tooClose(extension.loads(), THROTTLE.minGapMs)).toEqual([]);
    expect(extension.tabs.has(borrowed)).toBe(true);
    expect(extension.tabs.loads.every((load) => !extension.tabs.has(load.tabId))).toBe(true);
  });

  test("cancelling the picture collector aborts it and releases its tab", async () => {
    const extension = fakeExtension({
      pages: publicPages,
      publicPicture: () => new Promise(() => {}),
    });
    const run = extension.run([1]);
    await extension.clock.runUntil(() => extension.publicPictureCalls.length === 1);
    extension.fetcher.cancel(run.key);
    await extension.settle();

    expect(run.events.at(-1)).toEqual({ type: "done", reason: "cancelled" });
    expect(run.items()).toEqual([]);
    expect(extension.publicPictureCalls[0]?.signal.aborted).toBe(true);
    expect(extension.tabs.loads.every((load) => !extension.tabs.has(load.tabId))).toBe(true);
  });

  for (const claim of ["focus", "focus, then navigate"] as const) {
    test(`a picture tab the user claims by ${claim} stays theirs`, async () => {
      const firstPicture = Promise.withResolvers<PortPicture | null>();
      let reads = 0;
      const extension = fakeExtension({
        pages: publicPages,
        publicPicture: () => (reads++ === 0 ? firstPicture.promise : Promise.resolve(PICTURE)),
      });
      const run = extension.run([1, 2]);
      await extension.clock.runUntil(() => extension.publicPictureCalls.length === 1);
      const owned = extension.publicPictureCalls[0]?.tabId;
      if (owned === undefined) throw new Error("no picture tab");
      extension.tabs.activate(owned);
      if (claim === "focus, then navigate") {
        extension.tabs.navigate(owned, { url: `${ORIGINS.mfcStatic}/elsewhere`, title: "Mine" });
      }
      firstPicture.resolve(PICTURE);
      await extension.settle();

      expect(run.results().every((result) => result.ok)).toBe(true);
      expect(extension.tabs.has(owned)).toBe(true);
      expect(
        extension.tabs.loads.filter((load) => load.tabId === owned && !load.byUser),
      ).toHaveLength(1);
      expect(extension.publicPictureCalls[1]?.tabId).not.toBe(owned);
    });
  }

  test.each(COMMIT_STYLES)(
    "a picture the CDN answers with a 204 or a download never lands, and its tab is closed (%s commits)",
    async (_name, style) => {
      const extension = fakeExtension({
        pages: publicPages,
        navigationMs: () => 1500,
        deferNavigationCommit: style,
        dropsNavigation: (url) => url === pictureUrl(1) || url === pictureUrl(3),
      });
      const run = extension.run([1, 2, 3]);
      await extension.settle();

      expect(picturesOf(run.results())).toEqual([null, PICTURE, null]);
      expect(extensionTabsLeft(extension)).toEqual([]);
      expect(tooClose(extension.loads(), THROTTLE.minGapMs)).toEqual([]);
    },
  );

  test.each(COMMIT_STYLES)(
    "a picture redirected to another origin never lands, and its tab is closed (%s commits)",
    async (_name, style) => {
      const extension = fakeExtension({
        pages: publicPages,
        navigationMs: () => 1500,
        deferNavigationCommit: style,
        redirect: (url) => {
          if (url === pictureUrl(1)) return "https://example.com/1.jpg";
          return url === pictureUrl(2) ? `${ORIGINS.mfc}/upload/items/1/2.jpg` : undefined;
        },
      });
      const run = extension.run([1, 2, 3]);
      await extension.settle();

      expect(picturesOf(run.results())).toEqual([null, null, PICTURE]);
      expect(extension.publicPictureCalls.map((call) => call.tab?.url)).toEqual([pictureUrl(3)]);
      expect(extensionTabsLeft(extension)).toEqual([]);
    },
  );

  test.each(COMMIT_STYLES)(
    "a picture the owned tab already shows is read again without loading it (%s commits)",
    async (_name, style) => {
      const extension = fakeExtension({
        pages: ({ mfcItemId }) =>
          page(itemPage(mfcItemId, "public").replace(`/${mfcItemId}.jpg`, "/1.jpg")),
        navigationMs: () => 1500,
        deferNavigationCommit: style,
      });
      extension.tabs.open(`${ORIGINS.mfc}/`);
      const run = extension.run([1, 2]);
      await extension.settle();

      expect(picturesOf(run.results())).toEqual([PICTURE, PICTURE]);
      expect(extension.tabs.loads.map((load) => load.url)).toEqual([pictureUrl(1)]);
      expect(extension.publicPictureCalls).toHaveLength(2);
      expect(tooClose(extension.loads(), THROTTLE.minGapMs)).toEqual([]);
      expect(extensionTabsLeft(extension)).toEqual([]);
    },
  );

  test.each(COMMIT_STYLES)(
    "a new picture tab the browser calls complete before its load starts is waited for, read and closed (%s commits)",
    async (_name, style) => {
      const extension = fakeExtension({
        pages: publicPages,
        navigationMs: () => 1500,
        deferNavigationCommit: style,
      });
      extension.tabs.open(`${ORIGINS.mfc}/`);
      const run = extension.run([1]);
      await extension.settle();

      expect(picturesOf(run.results())).toEqual([PICTURE]);
      expect(extension.publicPictureCalls.map((call) => call.tab?.url)).toEqual([pictureUrl(1)]);
      expect(extensionTabsLeft(extension)).toEqual([]);
    },
  );

  for (const claimed of [false, true]) {
    test.each(COMMIT_STYLES)(
      `a picture tab cancelled before its load commits is closed only if the user never focused it (${claimed ? "focused" : "not focused"}, %s commits)`,
      async (_name, style) => {
        const extension = fakeExtension({
          pages: publicPages,
          navigationMs: () => 6000,
          deferNavigationCommit: style,
        });
        extension.tabs.open(`${ORIGINS.mfc}/`);
        const run = extension.run([1]);
        await extension.clock.runUntil(() => extension.tabs.loads.length === 1);
        const tabId = extension.tabs.loads[0]?.tabId;
        if (tabId === undefined) throw new Error("no picture tab");
        const loadingFrom = extension.clock.now();
        await extension.clock.runUntil(() => extension.clock.now() >= loadingFrom + 1000);
        if (claimed) extension.tabs.activate(tabId);
        extension.tabs.navigate(tabId, {
          url: "https://example.com/",
          title: "Mine",
          loadMs: 5000,
        });
        extension.fetcher.cancel(run.key);
        await extension.settle();

        expect(run.events.at(-1)).toEqual({ type: "done", reason: "cancelled" });
        expect(extension.tabs.has(tabId)).toBe(claimed);
      },
    );
  }

  test.each(["public", "gated"] as const)(
    "a %s picture's 20 s budget starts with its throttle turn, so a long pause before it drops nothing",
    async (picture) => {
      const throttleState = memoryValue(OPEN_THROTTLE);
      const extension = fakeExtension({
        throttleState,
        pages: async ({ mfcItemId }) => {
          await throttleState.save({
            ...throttleState.peek(),
            pausedUntil: extension.clock.now() + 3 * PICTURE_TIMEOUT_MS,
          });
          return page(itemPage(mfcItemId, picture));
        },
      });
      extension.tabs.open(`${ORIGINS.mfc}/`);
      const run = extension.run([1]);
      await extension.settle();

      expect(picturesOf(run.results())).toEqual([
        picture === "public" ? PICTURE : { base64: "/9j/", contentType: "image/jpeg" },
      ]);
    },
  );

  test("the picture tab uses the requester's Firefox cookie store", async () => {
    const extension = fakeExtension({ pages: publicPages });
    const cookieStoreId = "firefox-container-1";
    const requester = {
      tabId: extension.tabs.open(`${ORIGINS.web}/`, { cookieStoreId }),
      context: { incognito: false, cookieStoreId },
    };
    const run = extension.run([1], requester);
    await extension.clock.runUntil(() => extension.publicPictureCalls.length === 1);
    expect(extension.publicPictureCalls[0]?.tab?.cookieStoreId).toBe(cookieStoreId);
    await extension.settle();
    expect(run.results().map((result) => result.ok && result.picture)).toEqual([PICTURE]);
  });

  test("a restarted worker closes the picture tab its predecessor left", async () => {
    const ownedPictureTab = memoryValue<OwnedTab>(null);
    const extension = fakeExtension({ pages: publicPages, ownedPictureTab });
    const tabId = extension.tabs.open(pictureUrl(1));
    await ownedPictureTab.save({ state: "landed", tabId, path: "/upload/items/1/1.jpg" });
    extension.restart();
    await extension.settle();

    expect(extension.tabs.has(tabId)).toBe(false);
    expect(ownedPictureTab.peek()).toBeNull();
  });
});
