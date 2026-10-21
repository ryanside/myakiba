import { describe, expect, test } from "bun:test";
import {
  CHALLENGE_PAGE,
  ORIGINS,
  fakeClock,
  fakeExtension,
  itemId,
  itemPage,
  memoryValue,
  notFoundPage,
  page,
} from "../test/fake-browser";
import type { CollectedPage } from "./collect";
import { CHALLENGE_WINDOW_MS } from "./fetcher";
import { OPEN_THROTTLE, THROTTLE } from "./throttle";

function itemPages() {
  return ({ mfcItemId }: { readonly mfcItemId: number }) => page(itemPage(mfcItemId));
}

function gaps(times: readonly number[]): number[] {
  return times.slice(1).map((time, index) => time - (times[index] ?? 0));
}

describe("the queue", () => {
  test("fetches an id once for every run that asked, 2.5 s plus jitter apart", async () => {
    const extension = fakeExtension({ pages: itemPages() });
    const first = extension.run([1, 2]);
    const second = extension.run([2, 3]);
    await extension.clock.runUntil(() => first.done() && second.done());

    expect(extension.calls.map((call) => call.mfcItemId)).toEqual([1, 2, 3].map(itemId));
    for (const gap of gaps(extension.calls.map((call) => call.at))) {
      expect(gap).toBeGreaterThanOrEqual(THROTTLE.minGapMs);
      expect(gap).toBeLessThan(THROTTLE.minGapMs + THROTTLE.jitterMs);
    }
    expect(first.items().map((event) => event.mfcItemId)).toEqual([itemId(1), itemId(2)]);
    expect(second.items().map((event) => event.mfcItemId)).toEqual([itemId(2), itemId(3)]);
    expect(first.events.at(-1)).toEqual({ type: "done", reason: "complete" });
  });

  test("a restarted worker still waits out the gap", async () => {
    const clock = fakeClock();
    const throttleState = memoryValue(OPEN_THROTTLE);
    const before = fakeExtension({ pages: itemPages(), clock, throttleState });
    const first = before.run([1]);
    await clock.runUntil(first.done);
    const startedAt = before.calls[0]?.at ?? 0;

    const after = fakeExtension({ pages: itemPages(), clock, throttleState });
    const second = after.run([2]);
    await clock.runUntil(second.done);

    expect((after.calls[0]?.at ?? 0) - startedAt).toBeGreaterThanOrEqual(THROTTLE.minGapMs);
  });

  test("cancel drops the ids no other run waits for and ends the run", async () => {
    let release: (answer: CollectedPage) => void = () => {};
    const extension = fakeExtension({
      pages: (request) =>
        request.mfcItemId === 1
          ? new Promise((resolve) => {
              release = resolve;
            })
          : page(itemPage(request.mfcItemId)),
    });
    const cancelled = extension.run([1, 2, 3]);
    const other = extension.run([3]);
    await extension.clock.runUntil(() => extension.calls.length === 1);

    extension.fetcher.cancel(cancelled.key);
    release(page(itemPage(1)));
    await extension.clock.runUntil(other.done);
    await extension.settle();

    expect(extension.calls.map((call) => call.mfcItemId)).toEqual([itemId(1), itemId(3)]);
    expect(cancelled.items()).toEqual([]);
    expect(cancelled.events.at(-1)).toEqual({ type: "done", reason: "cancelled" });
    expect(other.items().map((event) => event.mfcItemId)).toEqual([itemId(3)]);
  });
});

describe("the MFC tab", () => {
  test("reuses an open MFC tab and leaves it open", async () => {
    const extension = fakeExtension({ pages: itemPages() });
    const open = extension.tabs.open(`${ORIGINS.mfc}/item/5`);
    const run = extension.run([1]);
    await extension.clock.runUntil(run.done);
    await extension.settle();

    expect(extension.calls[0]?.tabId).toBe(open);
    expect(extension.tabs.log).toEqual([]);
    expect(extension.tabs.has(open)).toBe(true);
  });

  test("opens an inactive MFC tab and closes it when the queue drains", async () => {
    const extension = fakeExtension({ pages: itemPages() });
    const run = extension.run([1, 2]);
    await extension.clock.runUntil(run.done);
    await extension.settle();

    expect(extension.tabs.log).toEqual([`create inactive ${ORIGINS.mfc}/`, "remove 100"]);
    expect(new Set(extension.calls.map((call) => call.tabId))).toEqual(new Set([100]));
  });

  test("leaves an opened tab open once the user focuses it", async () => {
    const extension = fakeExtension({
      pages: async (request) => {
        await extension.fetcher.noteTabActivated(100);
        return page(itemPage(request.mfcItemId));
      },
    });
    const run = extension.run([1]);
    await extension.clock.runUntil(run.done);
    await extension.settle();

    expect(extension.tabs.log).toEqual([`create inactive ${ORIGINS.mfc}/`]);
  });

  test("leaves an opened tab open once the user navigates it", async () => {
    const extension = fakeExtension({
      pages: (request) => {
        extension.tabs.set(100, { url: `${ORIGINS.mfc}/profile/someone` });
        return page(itemPage(request.mfcItemId));
      },
    });
    const run = extension.run([1]);
    await extension.clock.runUntil(run.done);
    await extension.settle();

    expect(extension.tabs.has(100)).toBe(true);
    expect(extension.tabs.log).toEqual([`create inactive ${ORIGINS.mfc}/`]);
  });
});

describe("a challenge", () => {
  function challengeOn(id: number) {
    return (request: { readonly mode: string; readonly mfcItemId: number }) =>
      request.mfcItemId === id && request.mode === "fetch"
        ? page(CHALLENGE_PAGE, { status: 403, cfMitigated: "challenge" })
        : page(itemPage(request.mfcItemId));
  }

  test("pauses the queue until the user clears it in the extension's own tab", async () => {
    const extension = fakeExtension({ pages: challengeOn(7) });
    const requester = extension.tabs.open(`${ORIGINS.web}/sync`);
    const run = extension.run([7, 8], requester);
    await extension.clock.runUntil(() =>
      run.events.some((event) => event.type === "status" && event.state === "needs_user"),
    );
    const askedAt = extension.clock.now();
    await extension.clock.runUntil(() => extension.clock.now() >= askedAt + 30_000);
    expect(extension.calls.map((call) => call.mfcItemId)).toEqual([itemId(7)]);

    extension.tabs.set(101, { title: "Item 7" });
    await extension.clock.runUntil(run.done);
    await extension.settle();

    expect(extension.calls.map((call) => [call.mfcItemId, call.mode])).toEqual([
      [itemId(7), "fetch"],
      [itemId(7), "document"],
      [itemId(8), "fetch"],
    ]);
    expect(run.items().map((event) => event.result.ok)).toEqual([true, true]);
    expect(extension.tabs.log).toEqual([
      `create inactive ${ORIGINS.mfc}/`,
      `update 101 ${ORIGINS.mfc}/item/7 active`,
      `update ${requester} active`,
      "remove 101",
    ]);
  });

  test("never navigates a borrowed tab", async () => {
    const extension = fakeExtension({ pages: challengeOn(7) });
    const requester = extension.tabs.open(`${ORIGINS.web}/sync`);
    const borrowed = extension.tabs.open(`${ORIGINS.mfc}/`);
    const run = extension.run([7], requester);
    await extension.clock.runUntil(() => extension.tabs.log.length === 1);
    extension.tabs.set(102, { title: "Item 7" });
    await extension.clock.runUntil(run.done);
    await extension.settle();

    expect(extension.tabs.log).toEqual([
      `create active ${ORIGINS.mfc}/item/7`,
      `update ${requester} active`,
      "remove 102",
    ]);
    expect(extension.tabs.has(borrowed)).toBe(true);
  });

  test("gives challenge_unsolved when the window closes", async () => {
    const extension = fakeExtension({ pages: challengeOn(7) });
    const run = extension.run([7]);
    const startedAt = extension.clock.now();
    await extension.clock.runUntil(run.done);

    expect(run.items()[0]?.result).toEqual({ ok: false, error: "challenge_unsolved" });
    expect(extension.clock.now() - startedAt).toBeGreaterThanOrEqual(CHALLENGE_WINDOW_MS);
  });
});

describe("item results", () => {
  test("backs off for Retry-After, retries once, then reports rate_limited", async () => {
    const extension = fakeExtension({
      pages: () => page("<html><title>Too many</title></html>", { status: 429, retryAfter: "5" }),
    });
    const run = extension.run([1]);
    await extension.clock.runUntil(run.done);

    const [first, second] = extension.calls;
    expect((second?.at ?? 0) - (first?.at ?? 0)).toBeGreaterThanOrEqual(5000);
    expect(run.events).toContainEqual({
      type: "status",
      state: "backing_off",
      mfcItemId: itemId(1),
      untilMs: (first?.at ?? 0) + 5000,
    });
    expect(run.items()[0]?.result).toEqual({ ok: false, error: "rate_limited" });
    expect(extension.calls).toHaveLength(2);
  });

  test("a retry after a backoff can succeed", async () => {
    let answered = 0;
    const extension = fakeExtension({
      pages: () =>
        answered++ === 0 ? page("", { status: 503, retryAfter: null }) : page(itemPage(1)),
    });
    const run = extension.run([1]);
    await extension.clock.runUntil(run.done);

    expect(run.items()[0]?.result.ok).toBe(true);
  });

  test("a 404 is signed out without the user menu and hidden or missing with it", async () => {
    const extension = fakeExtension({
      pages: ({ mfcItemId }) => page(notFoundPage(mfcItemId === 2), { status: 404 }),
    });
    const run = extension.run([1, 2]);
    await extension.clock.runUntil(run.done);

    expect(run.items().map((event) => event.result)).toEqual([
      { ok: false, error: "mfc_signed_out" },
      { ok: false, error: "hidden_or_missing" },
    ]);
  });

  test("another item's page is unexpected", async () => {
    const extension = fakeExtension({ pages: () => page(itemPage(99)) });
    const run = extension.run([1]);
    await extension.clock.runUntil(run.done);

    expect(run.items()[0]?.result).toEqual({ ok: false, error: "unexpected_page" });
  });

  test("a page that never answers times out", async () => {
    const extension = fakeExtension({ pages: () => new Promise(() => {}) });
    const run = extension.run([1]);
    await extension.clock.runUntil(run.done);

    expect(run.items()[0]?.result).toEqual({ ok: false, error: "timeout" });
  });

  test("a gated picture comes from the MFC tab", async () => {
    const picture = { base64: "/9j/", contentType: "image/jpeg" };
    const extension = fakeExtension({ pages: () => page(itemPage(1, "gated"), { picture }) });
    const run = extension.run([1]);
    await extension.clock.runUntil(run.done);

    expect(run.items()[0]?.result).toEqual({ ok: true, html: itemPage(1, "gated"), picture });
    expect(extension.pictureUrls).toEqual([]);
  });

  test("a public picture is fetched from the configured static origin", async () => {
    const extension = fakeExtension({ pages: () => page(itemPage(1, "public")) });
    const run = extension.run([1]);
    await extension.clock.runUntil(run.done);

    expect(extension.pictureUrls).toEqual([`${ORIGINS.mfcStatic}/upload/items/1/1.jpg`]);
    expect(run.items()[0]?.result).toMatchObject({ ok: true, picture: { base64: "AQID" } });
  });

  test("an item whose public picture fails still goes through without one", async () => {
    const extension = fakeExtension({
      pages: () => page(itemPage(1, "public")),
      publicPicture: () => Promise.reject(new TypeError("Failed to fetch")),
    });
    const run = extension.run([1]);
    await extension.clock.runUntil(run.done);

    expect(run.items()[0]?.result).toMatchObject({ ok: true, picture: null });
  });
});
