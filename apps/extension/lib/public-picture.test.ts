import { describe, expect, test } from "bun:test";
import type { PortPicture } from "@myakiba/mfc/bridge";
import {
  ORIGINS,
  fakeExtension,
  itemPage,
  memoryValue,
  page,
  tooClose,
} from "../test/fake-browser";
import type { OwnedTab } from "./mfc-tab";
import { PICTURE_TIMEOUT_MS } from "./picture";
import { THROTTLE } from "./throttle";

const PICTURE: PortPicture = { base64: "AQID", contentType: "image/jpeg" };
const publicPages = ({ mfcItemId }: { readonly mfcItemId: number }) =>
  page(itemPage(mfcItemId, "public"));
const pictureUrl = (id: number) => `${ORIGINS.mfcStatic}/upload/items/1/${id}.jpg`;

describe("public pictures in an owned static tab", () => {
  test("reuses one owned picture tab, never navigates borrowed tabs, and spaces every load", async () => {
    const extension = fakeExtension({
      pages: publicPages,
      navigationMs: () => 1500,
      deferNavigationCommit: true,
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
    const pictures = extension.tabs.loads.filter((load) => load.url.startsWith(ORIGINS.mfcStatic));
    expect(pictures.map((load) => load.url)).toEqual([pictureUrl(1), pictureUrl(2), pictureUrl(3)]);
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
  });

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

  for (const claim of ["focus", "navigate"] as const) {
    test(`a picture tab the user claims by ${claim} stays theirs`, async () => {
      const firstPicture = Promise.withResolvers<PortPicture | null>();
      let pictures = 0;
      const extension = fakeExtension({
        pages: publicPages,
        publicPicture: () => (pictures++ === 0 ? firstPicture.promise : Promise.resolve(PICTURE)),
      });
      const run = extension.run([1, 2]);
      await extension.clock.runUntil(() => extension.publicPictureCalls.length === 1);
      const owned = extension.publicPictureCalls[0]?.tabId;
      if (owned === undefined) throw new Error("no picture tab");
      if (claim === "focus") extension.tabs.activate(owned);
      else extension.tabs.navigate(owned, { url: `${ORIGINS.mfcStatic}/elsewhere`, title: "Mine" });
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

  test("a picture navigation the user redirects is left open and sends the item without a picture", async () => {
    const extension = fakeExtension({
      pages: publicPages,
      navigationMs: () => 6000,
      deferNavigationCommit: true,
    });
    extension.tabs.open(`${ORIGINS.mfc}/`);
    const run = extension.run([1]);
    await extension.clock.runUntil(() => extension.tabs.loads.length === 1);
    const tabId = extension.tabs.loads[0]?.tabId;
    if (tabId === undefined) throw new Error("no picture tab");
    extension.tabs.navigate(tabId, { url: "https://example.com/", title: "Mine" });
    await extension.settle();

    expect(run.results()).toEqual([{ ok: true, html: itemPage(1, "public"), picture: null }]);
    expect(extension.tabs.has(tabId)).toBe(true);
    expect(extension.publicPictureCalls).toEqual([]);
  });

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
    await ownedPictureTab.save({ tabId, path: "/upload/items/1/1.jpg" });
    extension.restart();
    await extension.settle();

    expect(extension.tabs.has(tabId)).toBe(false);
    expect(ownedPictureTab.peek()).toBeNull();
  });
});
