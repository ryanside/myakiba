import { describe, expect, test } from "bun:test";
import {
  CHALLENGE_PAGE,
  INCOGNITO,
  ORIGINS,
  fakeClock,
  fakeExtension,
  itemId,
  itemPage,
  memoryValue,
  notFoundPage,
  page,
  tooClose,
} from "../test/fake-browser";
import type { FakeClock, FakeExtension } from "../test/fake-browser";
import type { CollectedPage, PageRequest } from "./collect";
import { CHALLENGE_WINDOW_MS } from "./fetcher";
import type { OwnedTab } from "./mfc-tab";
import { PICTURE_TIMEOUT_MS } from "./picture";
import { OPEN_THROTTLE, THROTTLE } from "./throttle";

const SLOW_PAGE_MS = 3000;
const CONTAINER = "firefox-container-1";

function itemPages() {
  return ({ mfcItemId }: PageRequest) => page(itemPage(mfcItemId));
}

function slowItemPages(clock: FakeClock) {
  return async ({ mfcItemId }: PageRequest) => {
    await clock.sleep(SLOW_PAGE_MS);
    return page(itemPage(mfcItemId));
  };
}

function rateLimited(retryAfter: string | null): CollectedPage {
  return page("<html><title>Too many</title></html>", { status: 429, retryAfter });
}

function slowFor(clock: FakeClock, slowId: number, ms: number) {
  return async ({ mfcItemId }: PageRequest, signal: AbortSignal) => {
    await clock.sleep(mfcItemId === slowId ? ms : 0, signal);
    return page(itemPage(mfcItemId));
  };
}

/** MFC answers `ids` with a challenge until the user solves it in the tab, which reloads into the item. */
function challengeOn(ids: readonly number[], options: { readonly solved?: boolean } = {}) {
  const solved = new Set(options.solved ? ids : []);
  return {
    pages: (request: PageRequest) => {
      const id = request.mfcItemId;
      if (!ids.includes(id) || (request.mode === "document" && solved.has(id))) {
        return page(itemPage(id));
      }
      return page(CHALLENGE_PAGE, {
        status: 403,
        cfMitigated: request.mode === "fetch" ? "challenge" : null,
      });
    },
    solve(extension: FakeExtension, id: number, loadMs = 0): void {
      solved.add(id);
      extension.tabs.navigate(challengeTab(extension, id), { title: `Item ${id}`, loadMs });
    },
  };
}

function challengeTab(extension: FakeExtension, id: number): number {
  const tabId = extension.tabs.find(`${ORIGINS.mfc}/item/${id}`);
  if (tabId === undefined) throw new Error(`no tab shows item ${id}`);
  return tabId;
}

function gaps(times: readonly number[]): number[] {
  return times.slice(1).map((time, index) => time - (times[index] ?? 0));
}

async function advance(clock: FakeClock, ms: number): Promise<void> {
  const until = clock.now() + ms;
  const waited = clock.sleep(ms);
  await clock.runUntil(() => clock.now() >= until);
  await waited;
}

function fetches(calls: readonly { readonly mode: string; readonly mfcItemId: number }[]) {
  return calls.filter((call) => call.mode === "fetch").map((call) => call.mfcItemId);
}

function asked(
  events: readonly { readonly type: string; readonly state?: string }[],
  state: string,
): boolean {
  return events.some((event) => event.type === "status" && event.state === state);
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

    expect((after.tabs.loads[0]?.at ?? 0) - startedAt).toBeGreaterThanOrEqual(THROTTLE.minGapMs);
  });

  test("a slow MFC slows the queue, because the gap starts when a page answers", async () => {
    const clock = fakeClock();
    const extension = fakeExtension({ pages: slowItemPages(clock), clock });
    const run = extension.run([1, 2]);
    await clock.runUntil(run.done);

    const [first, second] = extension.calls;
    expect((second?.at ?? 0) - ((first?.at ?? 0) + SLOW_PAGE_MS)).toBeGreaterThanOrEqual(
      THROTTLE.minGapMs,
    );
  });

  test("a cold start's homepage load takes a turn before the first item", async () => {
    const extension = fakeExtension({ pages: itemPages() });
    const run = extension.run([1]);
    await extension.clock.runUntil(run.done);

    const [homepage] = extension.tabs.loads;
    expect(homepage?.url).toBe(`${ORIGINS.mfc}/`);
    expect((extension.calls[0]?.at ?? 0) - (homepage?.at ?? 0)).toBeGreaterThanOrEqual(
      THROTTLE.minGapMs,
    );
  });
});

describe("the throttle's books", () => {
  test("a worker restarted mid-load waits for the load it left running in the tab", async () => {
    const clock = fakeClock();
    const extension = fakeExtension({ clock, pages: slowFor(clock, 1, 10_000) });
    extension.run([1]);
    await clock.runUntil(() => extension.calls.length === 1);
    await advance(clock, 3000);

    extension.restart();
    const run = extension.run([2]);
    await clock.runUntil(run.done);

    expect(run.results().map((result) => result.ok)).toEqual([true]);
    expect(tooClose(extension.loads(), THROTTLE.minGapMs)).toEqual([]);
  });

  test("a persisted pause delays the first loads without timing them out", async () => {
    const clock = fakeClock();
    const pausedUntil = clock.now() + 120_000;
    const throttleState = memoryValue({ ...OPEN_THROTTLE, pausedUntil });
    const extension = fakeExtension({ clock, throttleState, pages: itemPages() });
    const run = extension.run([1]);
    await clock.runUntil(run.done);

    expect(extension.tabs.loads[0]?.at).toBeGreaterThanOrEqual(pausedUntil);
    expect(run.results()).toEqual([{ ok: true, html: itemPage(1), picture: null }]);
  });
});

describe("cancel", () => {
  test("drops the ids no other run waits for and ends the run", async () => {
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

  test("mid-load holds the next load until the first one has ended in the tab", async () => {
    const clock = fakeClock();
    const extension = fakeExtension({
      clock,
      pages: async ({ mfcItemId }) => {
        await clock.sleep(mfcItemId === 1 ? 20_000 : 0);
        return page(itemPage(mfcItemId));
      },
    });
    const cancelled = extension.run([1]);
    const other = extension.run([2]);
    await clock.runUntil(() => extension.calls.length === 1);
    await advance(clock, 5000);

    extension.fetcher.cancel(cancelled.key);
    await clock.runUntil(other.done);

    const [first, second] = extension.calls;
    expect((second?.at ?? 0) - (first?.endedAt ?? Infinity)).toBeGreaterThanOrEqual(
      THROTTLE.minGapMs,
    );
    expect(other.results().map((result) => result.ok)).toEqual([true]);
  });

  test("mid-load stops the load in the tab, so the next one need not wait it out", async () => {
    const clock = fakeClock();
    const extension = fakeExtension({ clock, pages: slowFor(clock, 1, 20_000) });
    const cancelled = extension.run([1]);
    const other = extension.run([2]);
    await clock.runUntil(() => extension.calls.length === 1);
    await advance(clock, 5000);

    extension.fetcher.cancel(cancelled.key);
    const cancelledAt = clock.now();
    await clock.runUntil(other.done);

    const [first, second] = extension.calls;
    expect(first?.signal.aborted).toBe(true);
    expect(first?.endedAt).toBe(cancelledAt);
    expect((second?.at ?? 0) - cancelledAt).toBeGreaterThanOrEqual(THROTTLE.minGapMs);
    expect((second?.at ?? Infinity) - cancelledAt).toBeLessThan(15_000);
  });

  test("during the gap closes the owned tab without waiting out the gap", async () => {
    const extension = fakeExtension({ pages: itemPages() });
    const run = extension.run([1, 2]);
    await extension.clock.runUntil(() => run.items().length === 1);

    extension.fetcher.cancel(run.key);
    await extension.clock.runUntil(() => extension.tabs.log.includes("remove 101"));

    expect(extension.clock.now() - (extension.calls[0]?.at ?? 0)).toBeLessThan(THROTTLE.minGapMs);
    expect(extension.calls).toHaveLength(1);
  });

  test("during a backoff stops waiting at once", async () => {
    const extension = fakeExtension({ pages: () => rateLimited("60") });
    const run = extension.run([1]);
    await extension.clock.runUntil(() => asked(run.events, "backing_off"));

    extension.fetcher.cancel(run.key);
    await extension.clock.runUntil(() => extension.tabs.log.includes("remove 101"));

    expect(extension.clock.now() - (extension.calls[0]?.at ?? 0)).toBeLessThan(60_000);
    expect(extension.calls).toHaveLength(1);
  });

  test("during a challenge stops waiting, closes the tab and focuses nothing", async () => {
    const extension = fakeExtension({ pages: challengeOn([7]).pages });
    const run = extension.run([7]);
    await extension.clock.runUntil(() => asked(run.events, "needs_user"));

    extension.fetcher.cancel(run.key);
    await extension.settle();

    expect(extension.clock.now() - (extension.calls[0]?.at ?? 0)).toBeLessThan(CHALLENGE_WINDOW_MS);
    expect(extension.tabs.log).toEqual([
      `create inactive ${ORIGINS.mfc}/`,
      `update 101 ${ORIGINS.mfc}/item/7`,
      "update 101 active",
      "remove 101",
    ]);
    expect(run.events.at(-1)).toEqual({ type: "done", reason: "cancelled" });
  });

  test("of the only run leaves a new request for the same id its own fetch", async () => {
    const challenge = challengeOn([7]);
    const extension = fakeExtension({ pages: challenge.pages });
    const cancelled = extension.run([7]);
    await extension.clock.runUntil(() => asked(cancelled.events, "needs_user"));

    extension.fetcher.cancel(cancelled.key);
    const again = extension.run([7]);
    await extension.clock.runUntil(() => asked(again.events, "needs_user"));
    challenge.solve(extension, 7);
    await extension.clock.runUntil(again.done);

    expect(fetches(extension.calls)).toEqual([itemId(7), itemId(7)]);
    expect(again.results().map((result) => result.ok)).toEqual([true]);
  });
});

describe("rate limits", () => {
  test("each one sets the shared pause, and a second in a row fails every queued item and pauses five minutes", async () => {
    const throttleState = memoryValue(OPEN_THROTTLE);
    const extension = fakeExtension({ pages: () => rateLimited("5"), throttleState });
    const first = extension.run([1, 2]);
    const second = extension.run([3]);
    await extension.clock.runUntil(() => first.done() && second.done());

    expect(fetches(extension.calls)).toEqual([itemId(1), itemId(1)]);
    expect(throttleState.peek().pausedUntil).toBe(
      (extension.calls[1]?.at ?? 0) + THROTTLE.maxPauseMs,
    );
    expect(first.results()).toEqual([
      { ok: false, error: "rate_limited" },
      { ok: false, error: "rate_limited" },
    ]);
    expect(second.results()).toEqual([{ ok: false, error: "rate_limited" }]);
    expect(first.events.at(-1)).toEqual({ type: "done", reason: "complete" });
  });

  test("Retry-After is honoured in full", async () => {
    let answered = 0;
    const extension = fakeExtension({
      pages: () => (answered++ === 0 ? rateLimited("120") : page(itemPage(1))),
    });
    const run = extension.run([1]);
    await extension.clock.runUntil(run.done);

    const [first, second] = extension.calls;
    expect((second?.at ?? 0) - (first?.at ?? 0)).toBeGreaterThanOrEqual(120_000);
    expect(run.events).toContainEqual({
      type: "status",
      state: "backing_off",
      mfcItemId: itemId(1),
      untilMs: (first?.at ?? 0) + 120_000,
    });
    expect(run.results()).toEqual([{ ok: true, html: itemPage(1), picture: null }]);
  });

  test("a Retry-After over five minutes halts the queue without a retry", async () => {
    const extension = fakeExtension({ pages: () => rateLimited("301") });
    const run = extension.run([1, 2]);
    await extension.clock.runUntil(run.done);

    expect(extension.calls).toHaveLength(1);
    expect(run.results()).toEqual([
      { ok: false, error: "rate_limited" },
      { ok: false, error: "rate_limited" },
    ]);
  });

  test("a request after a halt fails until the pause has passed, then starts fresh", async () => {
    let limited = true;
    const extension = fakeExtension({
      pages: ({ mfcItemId }) => (limited ? rateLimited("600") : page(itemPage(mfcItemId))),
    });
    const halted = extension.run([1]);
    await extension.clock.runUntil(halted.done);
    const haltedAt = extension.calls[0]?.at ?? 0;
    limited = false;

    await advance(extension.clock, 60_000);
    const early = extension.run([5]);
    await extension.clock.runUntil(early.done);
    await advance(extension.clock, haltedAt + 600_000 - extension.clock.now());
    const later = extension.run([6]);
    await extension.clock.runUntil(later.done);

    expect(early.results()).toEqual([{ ok: false, error: "rate_limited" }]);
    expect(later.results()).toEqual([{ ok: true, html: itemPage(6), picture: null }]);
    expect(extension.calls.map((call) => call.mfcItemId)).toEqual([itemId(1), itemId(6)]);
  });

  test("a restarted worker still fails requests until a halt's pause has passed", async () => {
    const clock = fakeClock();
    const throttleState = memoryValue(OPEN_THROTTLE);
    const before = fakeExtension({ pages: () => rateLimited("600"), clock, throttleState });
    const halted = before.run([1]);
    await clock.runUntil(halted.done);

    const after = fakeExtension({ pages: itemPages(), clock, throttleState });
    const run = after.run([2]);
    await clock.runUntil(run.done);

    expect(after.calls).toEqual([]);
    expect(run.results()).toEqual([{ ok: false, error: "rate_limited" }]);
  });

  test("one an hour after a cancelled backoff backs off and tries again", async () => {
    let limits = 1;
    const extension = fakeExtension({
      pages: ({ mfcItemId }) => (limits-- > 0 ? rateLimited("10") : page(itemPage(mfcItemId))),
    });
    const cancelled = extension.run([1]);
    await extension.clock.runUntil(() => asked(cancelled.events, "backing_off"));
    extension.fetcher.cancel(cancelled.key);
    await advance(extension.clock, 60 * 60_000);

    limits = 1;
    const run = extension.run([2]);
    await extension.clock.runUntil(run.done);

    expect(asked(run.events, "backing_off")).toBe(true);
    expect(run.results()).toEqual([{ ok: true, html: itemPage(2), picture: null }]);
  });

  test("rate limits with an answer between them are not in a row", async () => {
    let answered = 0;
    const extension = fakeExtension({
      pages: ({ mfcItemId }) =>
        answered++ % 2 === 0 ? rateLimited(null) : page(itemPage(mfcItemId)),
    });
    const run = extension.run([1, 2]);
    await extension.clock.runUntil(run.done);

    expect(fetches(extension.calls)).toEqual([1, 1, 2, 2].map(itemId));
    expect(run.results().map((result) => result.ok)).toEqual([true, true]);
  });
});

describe("a challenge", () => {
  test("pauses the queue until the user clears it in the extension's own tab", async () => {
    const challenge = challengeOn([7]);
    const extension = fakeExtension({ pages: challenge.pages });
    const requester = extension.myakiba.tabId;
    const run = extension.run([7, 8]);
    await extension.clock.runUntil(() => asked(run.events, "needs_user"));
    await advance(extension.clock, 30_000);
    expect(fetches(extension.calls)).toEqual([itemId(7)]);

    challenge.solve(extension, 7);
    await extension.clock.runUntil(run.done);
    await extension.settle();

    expect(fetches(extension.calls)).toEqual([itemId(7), itemId(8)]);
    expect(run.results().map((result) => result.ok)).toEqual([true, true]);
    expect(extension.tabs.log).toEqual([
      `create inactive ${ORIGINS.mfc}/`,
      `update 101 ${ORIGINS.mfc}/item/7`,
      "update 101 active",
      `update ${requester} active`,
      "remove 101",
    ]);
  });

  test("never navigates a borrowed tab", async () => {
    const extension = fakeExtension({ pages: challengeOn([7], { solved: true }).pages });
    const requester = extension.myakiba.tabId;
    const borrowed = extension.tabs.open(`${ORIGINS.mfc}/`);
    const run = extension.run([7]);
    await extension.clock.runUntil(run.done);
    await extension.settle();

    expect(extension.tabs.log).toEqual([
      `create inactive ${ORIGINS.mfc}/item/7`,
      "update 102 active",
      `update ${requester} active`,
      "remove 102",
    ]);
    expect(extension.tabs.has(borrowed)).toBe(true);
  });

  test("its navigation takes a turn after the page that raised it answers", async () => {
    const clock = fakeClock();
    const challenge = challengeOn([7], { solved: true });
    const extension = fakeExtension({
      clock,
      pages: async (request) => {
        if (request.mode === "fetch") await clock.sleep(SLOW_PAGE_MS);
        return challenge.pages(request);
      },
    });
    const run = extension.run([7]);
    await clock.runUntil(run.done);

    const navigation = extension.tabs.loads.find((load) => load.url.endsWith("/item/7"));
    const answeredAt = (extension.calls[0]?.at ?? 0) + SLOW_PAGE_MS;
    expect((navigation?.at ?? 0) - answeredAt).toBeGreaterThanOrEqual(THROTTLE.minGapMs);
  });

  test("keeps waiting through a localized challenge, whatever the tab's title says", async () => {
    const challenge = challengeOn([7]);
    const extension = fakeExtension({ pages: challenge.pages });
    const run = extension.run([7]);
    await extension.clock.runUntil(() => asked(run.events, "needs_user"));
    extension.tabs.navigate(challengeTab(extension, 7), { title: "Un instant…" });
    await advance(extension.clock, 30_000);
    expect(run.done()).toBe(false);

    challenge.solve(extension, 7);
    await extension.clock.runUntil(run.done);

    expect(run.results()).toEqual([{ ok: true, html: itemPage(7), picture: null }]);
  });

  test("gives challenge_unsolved when the window closes", async () => {
    const extension = fakeExtension({ pages: challengeOn([7]).pages });
    const run = extension.run([7]);
    const startedAt = extension.clock.now();
    await extension.clock.runUntil(run.done);

    expect(run.results()).toEqual([{ ok: false, error: "challenge_unsolved" }]);
    expect(extension.clock.now() - startedAt).toBeGreaterThanOrEqual(CHALLENGE_WINDOW_MS);
  });

  test("left unsolved fails every queued item without opening another challenge", async () => {
    const extension = fakeExtension({ pages: challengeOn([7, 8, 9]).pages });
    const first = extension.run([7, 8]);
    const second = extension.run([9]);
    await extension.clock.runUntil(() => first.done() && second.done());
    await extension.settle();

    expect(fetches(extension.calls)).toEqual([itemId(7)]);
    expect(extension.tabs.log.filter((entry) => entry.includes("/item/"))).toHaveLength(1);
    expect(first.results()).toEqual([
      { ok: false, error: "challenge_unsolved" },
      { ok: false, error: "challenge_unsolved" },
    ]);
    expect(second.results()).toEqual([{ ok: false, error: "challenge_unsolved" }]);
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

    expect(extension.tabs.log).toEqual([`create inactive ${ORIGINS.mfc}/`, "remove 101"]);
    expect(new Set(extension.calls.map((call) => call.tabId))).toEqual(new Set([101]));
  });

  test("leaves an opened tab open once the user focuses it", async () => {
    const extension = fakeExtension({
      pages: (request) => {
        extension.tabs.activate(101);
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
        extension.tabs.set(101, { url: `${ORIGINS.mfc}/profile/someone` });
        return page(itemPage(request.mfcItemId));
      },
    });
    const run = extension.run([1]);
    await extension.clock.runUntil(run.done);
    await extension.settle();

    expect(extension.tabs.has(101)).toBe(true);
    expect(extension.tabs.log).toEqual([`create inactive ${ORIGINS.mfc}/`]);
  });

  test("never navigates or closes a tab the user claimed before a challenge", async () => {
    const challenge = challengeOn([7], { solved: true });
    const extension = fakeExtension({
      pages: (request) => {
        if (request.mode === "fetch") extension.tabs.activate(101);
        return challenge.pages(request);
      },
    });
    const run = extension.run([7]);
    await extension.clock.runUntil(run.done);
    await extension.settle();

    expect(extension.tabs.log).toEqual([
      `create inactive ${ORIGINS.mfc}/`,
      `create inactive ${ORIGINS.mfc}/item/7`,
      "update 102 active",
      `update ${extension.myakiba.tabId} active`,
      "remove 102",
    ]);
    expect(extension.tabs.has(101)).toBe(true);
  });

  test("ignores only its own focus of the challenge tab, so a later one is the user's", async () => {
    const challenge = challengeOn([7]);
    const extension = fakeExtension({ pages: challenge.pages });
    const run = extension.run([7]);
    await extension.clock.runUntil(() => asked(run.events, "needs_user"));

    extension.tabs.activate(extension.myakiba.tabId);
    extension.tabs.activate(101);
    challenge.solve(extension, 7);
    await extension.clock.runUntil(run.done);
    await extension.settle();

    expect(extension.tabs.has(101)).toBe(true);
    expect(extension.tabs.log).not.toContain("remove 101");
  });

  test("a worker that starts with nothing queued closes the tab it left open", async () => {
    const ownedTab = memoryValue<OwnedTab>(null);
    const extension = fakeExtension({ pages: itemPages(), ownedTab });
    const left = extension.tabs.open(`${ORIGINS.mfc}/item/7`);
    await ownedTab.save({ tabId: left, path: "/item/7" });

    extension.fetcher.resume();
    await extension.settle();

    expect(extension.tabs.log).toEqual([`remove ${left}`]);
  });

  test("a timeout in a borrowed tab moves the item and the rest of the run to its own tab", async () => {
    let borrowed = -1;
    const extension = fakeExtension({
      pages: (request) =>
        extension.calls.at(-1)?.tabId === borrowed
          ? new Promise(() => {})
          : page(itemPage(request.mfcItemId)),
    });
    borrowed = extension.tabs.open(`${ORIGINS.mfc}/`);
    const run = extension.run([1, 2]);
    await extension.clock.runUntil(run.done);

    expect(extension.calls.map((call) => [call.mfcItemId, call.tabId])).toEqual([
      [itemId(1), borrowed],
      [itemId(1), 102],
      [itemId(2), 102],
    ]);
    expect(run.results().map((result) => result.ok)).toEqual([true, true]);
  });

  test("never borrows or opens an MFC tab outside an incognito requester's window", async () => {
    const extension = fakeExtension({ pages: itemPages() });
    const normal = extension.tabs.open(`${ORIGINS.mfc}/`);
    const requester = extension.tabs.open(`${ORIGINS.web}/sync`, { windowId: 2 });
    const run = extension.run([1], { tabId: requester, context: INCOGNITO });
    await extension.clock.runUntil(run.done);

    expect(extension.calls[0]?.tabId).not.toBe(normal);
    expect(extension.calls[0]?.tab).toMatchObject({ windowId: 2, incognito: true });
  });

  test("never borrows or opens an MFC tab outside a container requester's container", async () => {
    const extension = fakeExtension({ pages: itemPages() });
    const other = extension.tabs.open(`${ORIGINS.mfc}/`, { cookieStoreId: "firefox-default" });
    const requester = extension.tabs.open(`${ORIGINS.web}/sync`, { cookieStoreId: CONTAINER });
    const context = { incognito: false, cookieStoreId: CONTAINER };
    const run = extension.run([1], { tabId: requester, context });
    await extension.clock.runUntil(run.done);

    expect(extension.calls[0]?.tabId).not.toBe(other);
    expect(extension.calls[0]?.tab?.cookieStoreId).toBe(CONTAINER);
  });

  test("runs in different browsing contexts fetch the same id separately", async () => {
    const extension = fakeExtension({ pages: itemPages() });
    const requester = extension.tabs.open(`${ORIGINS.web}/sync`, { windowId: 2 });
    const normal = extension.run([1]);
    const incognito = extension.run([1], { tabId: requester, context: INCOGNITO });
    await extension.clock.runUntil(() => normal.done() && incognito.done());

    expect(extension.calls.map((call) => call.tab?.incognito)).toEqual([false, true]);
  });
});

describe("item results", () => {
  test("a 404 is signed out without the user menu and hidden or missing with it", async () => {
    const extension = fakeExtension({
      pages: ({ mfcItemId }) => page(notFoundPage(mfcItemId === 2), { status: 404 }),
    });
    const run = extension.run([1, 2]);
    await extension.clock.runUntil(run.done);

    expect(run.results()).toEqual([
      { ok: false, error: "mfc_signed_out" },
      { ok: false, error: "hidden_or_missing" },
    ]);
  });

  test("another item's page is unexpected", async () => {
    const extension = fakeExtension({ pages: () => page(itemPage(99)) });
    const run = extension.run([1]);
    await extension.clock.runUntil(run.done);

    expect(run.results()).toEqual([{ ok: false, error: "unexpected_page" }]);
  });

  test("a page that never answers times out", async () => {
    const extension = fakeExtension({ pages: () => new Promise(() => {}) });
    const run = extension.run([1]);
    await extension.clock.runUntil(run.done);

    expect(run.results()).toEqual([{ ok: false, error: "timeout" }]);
  });

  test("a gated picture comes from the MFC tab", async () => {
    const extension = fakeExtension({ pages: () => page(itemPage(1, "gated")) });
    const run = extension.run([1]);
    await extension.clock.runUntil(run.done);

    expect(run.results()).toEqual([
      {
        ok: true,
        html: itemPage(1, "gated"),
        picture: { base64: "/9j/", contentType: "image/jpeg" },
      },
    ]);
    expect(extension.pictureUrls).toEqual([
      "https://myfigurecollection.net/?_tb=commit&commit=nsp&objectType=item&objectId=1&size=1",
    ]);
  });

  test("a picture that stalls goes through as none and holds nothing up", async () => {
    const extension = fakeExtension({
      pages: ({ mfcItemId }) => page(itemPage(mfcItemId, "gated")),
      gatedPicture: () => new Promise(() => {}),
    });
    const run = extension.run([1, 2]);
    await extension.clock.runUntil(run.done);

    expect(run.results().map((result) => result.ok && result.picture)).toEqual([null, null]);
    const [first, second] = extension.calls;
    expect((second?.at ?? 0) - (first?.at ?? 0)).toBeLessThan(
      PICTURE_TIMEOUT_MS + THROTTLE.minGapMs + THROTTLE.jitterMs,
    );
  });

  test("a public picture is fetched from the configured static origin", async () => {
    const extension = fakeExtension({ pages: () => page(itemPage(1, "public")) });
    const run = extension.run([1]);
    await extension.clock.runUntil(run.done);

    expect(extension.pictureUrls).toEqual([`${ORIGINS.mfcStatic}/upload/items/1/1.jpg`]);
    expect(run.results()).toEqual([
      {
        ok: true,
        html: itemPage(1, "public"),
        picture: { base64: "AQID", contentType: "image/jpeg" },
      },
    ]);
  });

  test("an item whose public picture fails still goes through without one", async () => {
    const extension = fakeExtension({
      pages: () => page(itemPage(1, "public")),
      publicPicture: () => Promise.reject(new TypeError("Failed to fetch")),
    });
    const run = extension.run([1]);
    await extension.clock.runUntil(run.done);

    expect(run.results()).toEqual([{ ok: true, html: itemPage(1, "public"), picture: null }]);
  });
});
