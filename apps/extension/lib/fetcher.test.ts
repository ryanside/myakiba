import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import type { Mock } from "bun:test";
import { Panic, Result } from "better-result";
import {
  CHALLENGE_PAGE,
  COMMIT_STYLES,
  answerInvalid,
  injectionFailed,
  INCOGNITO,
  ORIGINS,
  OTHER_WINDOW,
  fakeClock,
  fakeExtension,
  itemId,
  itemPage,
  memoryValue,
  notFoundPage,
  page,
  pageFetchFailed,
  tooClose,
} from "../test/fake-browser";
import type { FakeClock, FakeExtension, PageAnswer, PictureAnswer } from "../test/fake-browser";
import type { CollectedPage, PageRequest } from "./collect";
import { PAGE_TIMEOUT_MS } from "./collect";
import { CollectorAnswerInvalid } from "./errors/collector-answer-invalid";
import { CollectorInjectionFailed } from "./errors/collector-injection-failed";
import { PictureFetchFailed } from "./errors/picture-fetch-failed";
import { PictureRejected } from "./errors/picture-rejected";
import { PictureTimedOut } from "./errors/picture-timed-out";
import { SessionStorageUnavailable } from "./errors/session-storage-unavailable";
import { CHALLENGE_WINDOW_MS } from "./fetcher";
import type { OwnedTab } from "./owned-tab";
import { PICTURE_TIMEOUT_MS } from "./picture";
import { OPEN_THROTTLE, THROTTLE } from "./throttle";

const SLOW_PAGE_MS = 3000;
const CONTAINER = "firefox-container-1";
const NORMAL = { incognito: false, cookieStoreId: null };
const MFC_ERROR = page("<html><title>Server error</title></html>", { status: 500 });
const SHORT_SETTLE_MS = 5000;
const ERROR_PAGE = "Frame with ID 0 is showing error page";
const STALLED_LOAD_MS = PAGE_TIMEOUT_MS + 25_000;
const HOMEPAGE = `${ORIGINS.mfc}/`;
const NEVER_LANDS = [
  [
    "redirects to a site the extension cannot read",
    { redirect: (url: string) => (url === HOMEPAGE ? "https://example.com/" : undefined) },
  ],
  [
    "redirects to another origin it can read",
    { redirect: (url: string) => (url === HOMEPAGE ? `${ORIGINS.mfcStatic}/` : undefined) },
  ],
  ["is answered with a 204 or a download", { dropsNavigation: (url: string) => url === HOMEPAGE }],
] as const;

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
  const tabId = extension.tabs.shownByExtension.findLast(
    (raised) => extension.tabs.get(raised)?.url === `${ORIGINS.mfc}/item/${id}`,
  );
  if (tabId === undefined) throw new Error(`no tab the extension showed has item ${id}`);
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

/** Storage refuses the first write that records a pause, as a full quota would. */
function refusingFirstPause(fail: () => Result<void, SessionStorageUnavailable>) {
  const stored = memoryValue(OPEN_THROTTLE);
  let refused = false;
  return {
    load: stored.load,
    save: async (next: typeof OPEN_THROTTLE) => {
      if (refused || next.pausedUntil === 0) return stored.save(next);
      refused = true;
      return fail();
    },
  };
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

  test("a navigation still running at its deadline is stopped before the next load starts", async () => {
    let navigations = 0;
    const extension = fakeExtension({
      pages: itemPages(),
      navigationMs: () => (navigations++ === 0 ? PAGE_TIMEOUT_MS + 25_000 : 0),
    });
    const run = extension.run([1, 2]);
    await extension.clock.runUntil(run.done);

    expect(run.results()).toEqual([
      { ok: false, error: "timeout" },
      { ok: true, html: itemPage(2), picture: null },
    ]);
    expect(extension.tabs.log.slice(0, 3)).toEqual([
      `create inactive ${ORIGINS.mfc}/`,
      "remove 101",
      `create inactive ${ORIGINS.mfc}/`,
    ]);
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

  describe("when storage fails", () => {
    let warn: Mock<typeof console.warn>;
    let error: Mock<typeof console.error>;

    beforeEach(() => {
      warn = spyOn(console, "warn").mockImplementation(() => {});
      error = spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
      warn.mockRestore();
      error.mockRestore();
    });

    const unavailable = (op: "get" | "set", message: string) =>
      new SessionStorageUnavailable({ key: "throttle", op, cause: new Error(message) });

    /** Fails the `nth` write of the books once the arming item's page has answered, by refusing it or by throwing. */
    function failingBooks(nth: number, how: "refuses" | "throws" = "refuses") {
      const stored = memoryValue(OPEN_THROTTLE);
      let armed = false;
      let count = 0;
      return {
        arm: () => {
          armed = true;
        },
        throttleState: {
          load: stored.load,
          save: async (next: typeof OPEN_THROTTLE) => {
            if (!armed || ++count !== nth) return stored.save(next);
            if (how === "throws") throw new TypeError("storage.session.set is not a function");
            return Result.err(unavailable("set", "QuotaExceededError"));
          },
        },
      };
    }

    function armedOn(books: ReturnType<typeof failingBooks>, armingId = 1) {
      return ({ mfcItemId }: PageRequest) => {
        if (mfcItemId === armingId) books.arm();
        return page(itemPage(mfcItemId));
      };
    }

    test("a load whose end cannot be booked is logged, and the queue goes on", async () => {
      const books = failingBooks(1);
      const extension = fakeExtension({
        throttleState: books.throttleState,
        pages: armedOn(books),
      });
      const run = extension.run([1, 2]);
      await extension.clock.runUntil(run.done);

      expect(run.results().map((result) => result.ok)).toEqual([true, true]);
      expect(fetches(extension.calls)).toEqual([itemId(1), itemId(2)]);
      expect(error.mock.calls.map((call) => String(call[0]))).toEqual([
        "could not book the end of an MFC page load",
      ]);
    });

    test("an answer that cannot be booked fails its item, and the queue goes on", async () => {
      const books = failingBooks(2);
      const extension = fakeExtension({
        throttleState: books.throttleState,
        pages: armedOn(books),
      });
      const run = extension.run([1, 2]);
      await extension.clock.runUntil(run.done);

      expect(run.results().map((result) => result.ok || result.error)).toEqual([
        "unexpected_page",
        true,
      ]);
      expect(fetches(extension.calls)).toEqual([itemId(1), itemId(2)]);
      expect(warn.mock.calls.map((call) => String(call[0]))).toEqual([
        expect.stringContaining("SessionStorageUnavailable for MFC item 1:"),
      ]);
      expect(error).not.toHaveBeenCalled();
    });

    test.each([
      ["the only item of a run", [1], 1],
      ["the last item of a run", [1, 2, 3], 3],
    ] as const)(
      "an answer that cannot be booked for %s ends the run and closes the MFC tab",
      async (_name, ids, last) => {
        const books = failingBooks(2);
        const extension = fakeExtension({
          throttleState: books.throttleState,
          pages: armedOn(books, last),
        });
        const run = extension.run(ids);
        await extension.clock.runUntil(run.done);
        await extension.settle();

        const answered = run.results().map((result) => result.ok || result.error);
        expect(answered).toEqual([...ids.slice(0, -1).map(() => true as const), "unexpected_page"]);
        expect(extension.tabs.log).toEqual([`create inactive ${ORIGINS.mfc}/`, "remove 101"]);
      },
    );

    test.each([
      ["the only item of a run", [1], 1],
      ["the last item of a run", [1, 2, 3], 3],
    ] as const)(
      "an answer whose booking throws for %s is reported as a defect, ends the run and closes the MFC tab",
      async (_name, ids, last) => {
        const books = failingBooks(2, "throws");
        const extension = fakeExtension({
          throttleState: books.throttleState,
          pages: armedOn(books, last),
        });
        const run = extension.run(ids);
        await extension.clock.runUntil(run.done);
        await extension.settle();

        const answered = run.results().map((result) => result.ok || result.error);
        expect(answered).toEqual([...ids.slice(0, -1).map(() => true as const), "unexpected_page"]);
        expect(extension.tabs.log).toEqual([`create inactive ${ORIGINS.mfc}/`, "remove 101"]);
        expect(error).toHaveBeenCalledTimes(1);
        const [message, defect] = error.mock.calls[0] ?? [];
        expect(String(message)).toContain(`MFC item ${last}`);
        expect(Panic.is(defect)).toBe(true);
      },
    );

    test("books storage will not read leave the queue on an open throttle, and are logged once", async () => {
      const extension = fakeExtension({
        throttleState: {
          load: async () => Result.err(unavailable("get", "storage is gone")),
          save: async () => Result.ok(),
        },
        pages: itemPages(),
      });
      const run = extension.run([1, 2, 3]);
      await extension.clock.runUntil(run.done);

      expect(run.results().map((result) => result.ok)).toEqual([true, true, true]);
      expect(warn.mock.calls.map((call) => String(call[0]))).toEqual([
        expect.stringContaining(
          "SessionStorageUnavailable: storage.session would not get throttle",
        ),
      ]);
    });
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

  test("mid-load starts the next load a gap after the first really ends, not when its reservation runs out", async () => {
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
    expect((second?.at ?? Infinity) - (first?.endedAt ?? 0)).toBeLessThan(
      THROTTLE.minGapMs + THROTTLE.jitterMs,
    );
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

  test("during a challenge stops waiting, focuses nothing and leaves the shown tab to the user", async () => {
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
    ]);
    expect(extension.tabs.has(101)).toBe(true);
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
    expect(extension.tabs.has(101)).toBe(true);
  });
});

describe("rate limits", () => {
  test("each one sets the shared pause, and a second in a row fails every queued item and halts five minutes", async () => {
    const throttleState = memoryValue(OPEN_THROTTLE);
    const extension = fakeExtension({ pages: () => rateLimited("5"), throttleState });
    const first = extension.run([1, 2]);
    const second = extension.run([3]);
    await extension.clock.runUntil(() => first.done() && second.done());

    const [limited, again] = extension.calls;
    expect(fetches(extension.calls)).toEqual([itemId(1), itemId(1)]);
    expect((again?.at ?? 0) - (limited?.at ?? 0)).toBeGreaterThanOrEqual(5000);
    expect(throttleState.peek().haltedUntil).toBe((again?.at ?? 0) + THROTTLE.maxPauseMs);
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

  test("after a halt for limits in a row, a restarted worker fails new runs at once until it has passed", async () => {
    let limited = true;
    const extension = fakeExtension({
      pages: ({ mfcItemId }) => (limited ? rateLimited("5") : page(itemPage(mfcItemId))),
    });
    const halted = extension.run([1]);
    await extension.clock.runUntil(halted.done);
    const haltedAt = extension.clock.now();
    limited = false;

    extension.restart();
    const early = extension.run([2]);
    await extension.clock.runUntil(early.done);
    expect(extension.clock.now() - haltedAt).toBeLessThan(1000);
    await advance(extension.clock, haltedAt + THROTTLE.maxPauseMs - extension.clock.now());
    const later = extension.run([3]);
    await extension.clock.runUntil(later.done);

    expect(early.results()).toEqual([{ ok: false, error: "rate_limited" }]);
    expect(later.results()).toEqual([{ ok: true, html: itemPage(3), picture: null }]);
    expect(fetches(extension.calls)).toEqual([itemId(1), itemId(1), itemId(3)]);
  });

  test("a worker restart between two limits in a row still halts", async () => {
    const extension = fakeExtension({ pages: () => rateLimited("5") });
    const first = extension.run([1]);
    await extension.clock.runUntil(() => asked(first.events, "backing_off"));

    extension.restart();
    const second = extension.run([2, 3]);
    await extension.clock.runUntil(second.done);

    expect(fetches(extension.calls)).toEqual([itemId(1), itemId(2)]);
    expect(second.results()).toEqual([
      { ok: false, error: "rate_limited" },
      { ok: false, error: "rate_limited" },
    ]);
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
  test("pauses the queue until the user clears it in the tab it showed them, which stays theirs", async () => {
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
    ]);
    expect(extension.tabs.has(101)).toBe(true);
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

  test.each([
    ["a signed-out 404", page(notFoundPage(false), { status: 404 }), "mfc_signed_out"],
    ["a signed-in 404", page(notFoundPage(true), { status: 404 }), "hidden_or_missing"],
    ["another item's page", page(itemPage(99)), "unexpected_page"],
    ["an MFC error", MFC_ERROR, "unexpected_page"],
  ] as const)(
    "solved into %s answers at once and leaves the rest of the queue running",
    async (_page, solvedInto, error) => {
      let solved = false;
      const challenge = challengeOn([7]);
      const extension = fakeExtension({
        pages: (request) =>
          solved && request.mode === "document" ? solvedInto : challenge.pages(request),
      });
      const first = extension.run([7, 8]);
      const second = extension.run([9]);
      await extension.clock.runUntil(() => asked(first.events, "needs_user"));

      solved = true;
      extension.tabs.navigate(challengeTab(extension, 7), { title: "MyFigureCollection.net" });
      const solvedAt = extension.clock.now();
      await extension.clock.runUntil(() => first.items().length === 1);
      expect(extension.clock.now() - solvedAt).toBeLessThan(1000);
      await extension.clock.runUntil(() => first.done() && second.done());

      expect(first.results()).toEqual([
        { ok: false, error },
        { ok: true, html: itemPage(8), picture: null },
      ]);
      expect(second.results()).toEqual([{ ok: true, html: itemPage(9), picture: null }]);
    },
  );

  test("solved into a rate limit backs off, then tries the item again", async () => {
    let solved = false;
    const challenge = challengeOn([7]);
    const extension = fakeExtension({
      pages: (request) => {
        if (!solved) return challenge.pages(request);
        return request.mode === "document" ? rateLimited("10") : page(itemPage(7));
      },
    });
    const run = extension.run([7]);
    await extension.clock.runUntil(() => asked(run.events, "needs_user"));

    solved = true;
    extension.tabs.navigate(challengeTab(extension, 7), { title: "Too many" });
    await extension.clock.runUntil(run.done);

    expect(asked(run.events, "backing_off")).toBe(true);
    expect(run.results()).toEqual([{ ok: true, html: itemPage(7), picture: null }]);
  });

  test("a failed read of the challenge tab means not yet", async () => {
    const challenge = challengeOn([7]);
    let reads = 0;
    const extension = fakeExtension({
      pages: (request, _signal, tabId) => {
        if (request.mode === "document" && ++reads === 1) {
          return injectionFailed(tabId, "Frame with ID 0 was removed.");
        }
        return challenge.pages(request);
      },
    });
    const run = extension.run([7]);
    await extension.clock.runUntil(() => asked(run.events, "needs_user"));
    await advance(extension.clock, 10_000);
    expect(run.done()).toBe(false);

    challenge.solve(extension, 7);
    await extension.clock.runUntil(run.done);

    expect(run.results()).toEqual([{ ok: true, html: itemPage(7), picture: null }]);
  });

  test("reads the solved page again when the first read of it fails, without waiting for a navigation", async () => {
    const challenge = challengeOn([7]);
    let solved = false;
    let failedReads = 0;
    const extension = fakeExtension({
      pages: (request, _signal, tabId) => {
        if (solved && request.mode === "document" && failedReads++ === 0) {
          return injectionFailed(tabId, "Frame with ID 0 was removed.");
        }
        return challenge.pages(request);
      },
    });
    const run = extension.run([7, 8]);
    await extension.clock.runUntil(() => asked(run.events, "needs_user"));

    solved = true;
    challenge.solve(extension, 7);
    const solvedAt = extension.clock.now();
    await extension.clock.runUntil(() => run.items().length === 1);
    expect(extension.clock.now() - solvedAt).toBeLessThan(5000);
    await extension.clock.runUntil(run.done);

    expect(run.results()).toEqual([
      { ok: true, html: itemPage(7), picture: null },
      { ok: true, html: itemPage(8), picture: null },
    ]);
  });

  test("takes a page whose status it cannot read as not answered yet", async () => {
    const challenge = challengeOn([7]);
    let solved = false;
    const extension = fakeExtension({
      pages: (request) =>
        request.mode === "document" && !solved
          ? page("<html><head><title>Un instant…</title></head></html>", { status: 0 })
          : challenge.pages(request),
    });
    const run = extension.run([7]);
    await extension.clock.runUntil(() => asked(run.events, "needs_user"));
    await advance(extension.clock, 30_000);
    expect(run.done()).toBe(false);

    solved = true;
    challenge.solve(extension, 7);
    await extension.clock.runUntil(run.done);

    expect(run.results()).toEqual([{ ok: true, html: itemPage(7), picture: null }]);
  });

  test("left unsolved for its whole window reads the page a handful of times, not every poll", async () => {
    const extension = fakeExtension({ pages: challengeOn([7]).pages });
    const run = extension.run([7]);
    await extension.clock.runUntil(run.done);

    const reads = extension.calls.filter((call) => call.mode === "document");
    expect(run.results()).toEqual([{ ok: false, error: "challenge_unsolved" }]);
    expect(reads.length).toBeGreaterThan(0);
    expect(reads.length).toBeLessThanOrEqual(3);
  });

  test("served with 503 and a Retry-After over five minutes halts without asking the user", async () => {
    const throttleState = memoryValue(OPEN_THROTTLE);
    const extension = fakeExtension({
      throttleState,
      pages: () =>
        page(CHALLENGE_PAGE, { status: 503, cfMitigated: "challenge", retryAfter: "600" }),
    });
    const run = extension.run([7, 8]);
    await extension.clock.runUntil(run.done);

    expect(run.results()).toEqual([
      { ok: false, error: "rate_limited" },
      { ok: false, error: "rate_limited" },
    ]);
    expect(asked(run.events, "needs_user")).toBe(false);
    expect(extension.tabs.loads.map((load) => load.url)).toEqual([`${ORIGINS.mfc}/`]);
    expect(throttleState.peek().pausedUntil).toBe((extension.calls[0]?.at ?? 0) + 600_000);
  });

  test("served with a Retry-After over five minutes still fails new runs at once after a worker restart", async () => {
    let challenged = true;
    const extension = fakeExtension({
      pages: ({ mfcItemId }) =>
        challenged
          ? page(CHALLENGE_PAGE, { status: 503, cfMitigated: "challenge", retryAfter: "400" })
          : page(itemPage(mfcItemId)),
    });
    const halted = extension.run([7]);
    await extension.clock.runUntil(halted.done);
    challenged = false;
    await advance(extension.clock, 200_000);

    extension.restart();
    const startedAt = extension.clock.now();
    const run = extension.run([8]);
    await extension.clock.runUntil(run.done);

    expect(extension.clock.now() - startedAt).toBeLessThan(1000);
    expect(run.results()).toEqual([{ ok: false, error: "rate_limited" }]);
  });

  test("served with 503 and a short Retry-After waits out the pause, then asks the user", async () => {
    const challenge = challengeOn([7]);
    const extension = fakeExtension({
      pages: (request) =>
        request.mode === "fetch"
          ? page(CHALLENGE_PAGE, { status: 503, cfMitigated: "challenge", retryAfter: "10" })
          : challenge.pages(request),
    });
    const run = extension.run([7]);
    await extension.clock.runUntil(() => asked(run.events, "needs_user"));
    challenge.solve(extension, 7);
    await extension.clock.runUntil(run.done);

    const shown = extension.tabs.loads.find((load) => load.url.endsWith("/item/7"));
    expect((shown?.at ?? 0) - (extension.calls[0]?.at ?? 0)).toBeGreaterThanOrEqual(10_000);
    expect(fetches(extension.calls)).toEqual([itemId(7)]);
    expect(run.results()).toEqual([{ ok: true, html: itemPage(7), picture: null }]);
  });

  test("served with 503, keeps waiting while the tab still shows it with that status", async () => {
    let solved = false;
    const extension = fakeExtension({
      pages: ({ mode, mfcItemId }) => {
        if (solved && mode === "document") return page(itemPage(mfcItemId));
        return page(CHALLENGE_PAGE, {
          status: 503,
          cfMitigated: mode === "fetch" ? "challenge" : null,
          retryAfter: "10",
        });
      },
    });
    const run = extension.run([7]);
    await extension.clock.runUntil(() => asked(run.events, "needs_user"));
    await advance(extension.clock, 30_000);
    expect(run.done()).toBe(false);

    solved = true;
    extension.tabs.navigate(challengeTab(extension, 7), { title: "Item 7" });
    await extension.clock.runUntil(run.done);

    expect(asked(run.events, "backing_off")).toBe(false);
    expect(run.results()).toEqual([{ ok: true, html: itemPage(7), picture: null }]);
  });

  test("a 503 without cf-mitigated: challenge is a rate limit, whatever its title", async () => {
    let answered = 0;
    const extension = fakeExtension({
      pages: ({ mfcItemId }) =>
        answered++ === 0
          ? page(CHALLENGE_PAGE, { status: 503, retryAfter: "10" })
          : page(itemPage(mfcItemId)),
    });
    const run = extension.run([7]);
    await extension.clock.runUntil(run.done);

    expect(asked(run.events, "backing_off")).toBe(true);
    expect(asked(run.events, "needs_user")).toBe(false);
    expect(run.results()).toEqual([{ ok: true, html: itemPage(7), picture: null }]);
  });

  test("the reload that delivers the solved item takes a throttle turn", async () => {
    const challenge = challengeOn([7]);
    const extension = fakeExtension({ pages: challenge.pages });
    const run = extension.run([7, 8]);
    await extension.clock.runUntil(() => asked(run.events, "needs_user"));
    await advance(extension.clock, 10_000);

    challenge.solve(extension, 7, 2000);
    await extension.clock.runUntil(run.done);

    const reload = extension.tabs.loads.findLast((load) => load.url.endsWith("/item/7"));
    const next = extension.calls.find((call) => call.mode === "fetch" && call.mfcItemId === 8);
    expect((next?.at ?? 0) - (reload?.endedAt ?? Infinity)).toBeGreaterThanOrEqual(
      THROTTLE.minGapMs,
    );
  });

  test("shows in the window of the run still waiting, and hands focus back there", async () => {
    const challenge = challengeOn([7]);
    const extension = fakeExtension({ pages: challenge.pages });
    const other = extension.tabs.open(`${ORIGINS.web}/sync`, { windowId: OTHER_WINDOW });
    const first = extension.run([7]);
    const second = extension.run([7], { tabId: other, context: NORMAL });
    await extension.clock.runUntil(() => extension.calls.length === 1);

    extension.fetcher.cancel(first.key);
    await extension.clock.runUntil(() => asked(second.events, "needs_user"));
    challenge.solve(extension, 7);
    await extension.clock.runUntil(second.done);

    expect(second.results()).toEqual([{ ok: true, html: itemPage(7), picture: null }]);
    expect(extension.tabs.focused).toEqual([OTHER_WINDOW, OTHER_WINDOW]);
    expect(extension.tabs.get(other)?.active).toBe(true);
  });

  test("still answers its item when the run's tab closed before focus could go back", async () => {
    const challenge = challengeOn([7]);
    const extension = fakeExtension({ pages: challenge.pages });
    const run = extension.run([7]);
    await extension.clock.runUntil(() => asked(run.events, "needs_user"));
    await extension.tabs.api.remove(extension.myakiba.tabId);
    challenge.solve(extension, 7);
    await extension.clock.runUntil(run.done);

    expect(run.results()).toEqual([{ ok: true, html: itemPage(7), picture: null }]);
    expect(extension.tabs.focused).toEqual([1]);
  });

  test("gives challenge_unsolved when the window closes", async () => {
    const extension = fakeExtension({ pages: challengeOn([7]).pages });
    const run = extension.run([7]);
    const startedAt = extension.clock.now();
    await extension.clock.runUntil(run.done);

    expect(run.results()).toEqual([{ ok: false, error: "challenge_unsolved" }]);
    expect(extension.clock.now() - startedAt).toBeGreaterThanOrEqual(CHALLENGE_WINDOW_MS);
  });

  test("whose tab the browser refuses to show, as during a drag, stays the extension's and closes once it can", async () => {
    const challenge = challengeOn([7]);
    const extension = fakeExtension({
      pages: (request) => {
        extension.tabs.drag(extension.myakiba.tabId, true);
        return challenge.pages(request);
      },
    });
    const run = extension.run([7]);
    await extension.clock.runUntil(run.done);
    extension.tabs.drag(extension.myakiba.tabId, false);
    await extension.settle();

    expect(run.results()).toEqual([{ ok: false, error: "challenge_unsolved" }]);
    expect(extension.tabs.shownByExtension).toEqual([]);
    expect(extension.tabs.has(101)).toBe(false);
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

  test("closes its own tab whatever page it moved to, since only a focus makes it the user's", async () => {
    const extension = fakeExtension({
      pages: (request) => {
        extension.tabs.set(101, { url: "https://example.com/" });
        return page(itemPage(request.mfcItemId));
      },
    });
    const run = extension.run([1]);
    await extension.clock.runUntil(run.done);
    await extension.settle();

    expect(extension.tabs.log).toEqual([`create inactive ${ORIGINS.mfc}/`, "remove 101"]);
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
    ]);
    expect(extension.tabs.has(101)).toBe(true);
    expect(extension.tabs.has(102)).toBe(true);
  });

  test("a worker that starts with nothing queued closes the tab it left open", async () => {
    const ownedTab = memoryValue<OwnedTab>(null);
    const extension = fakeExtension({ pages: itemPages(), ownedTab });
    const left = extension.tabs.open(`${ORIGINS.mfc}/item/7`);
    await ownedTab.save({ state: "landed", tabId: left });

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

  test("a tab the user focuses while the extension creates it stays theirs", async () => {
    const extension = fakeExtension({
      pages: itemPages(),
      onTabCreated: (tabId) => extension.tabs.activate(tabId),
    });
    const run = extension.run([1]);
    await extension.clock.runUntil(run.done);
    await extension.settle();

    expect(extension.tabs.has(101)).toBe(true);
    expect(extension.tabs.log).toEqual([`create inactive ${ORIGINS.mfc}/`]);
  });

  test("gives up at once on a new tab the user takes somewhere else, and leaves it open", async () => {
    const extension = fakeExtension({
      pages: itemPages(),
      navigationMs: () => 5000,
      onTabCreated: (tabId) => {
        extension.tabs.activate(tabId);
        extension.tabs.navigate(tabId, {
          url: "https://example.com/",
          title: "Example",
          loadMs: 1000,
        });
      },
    });
    const startedAt = extension.clock.now();
    const run = extension.run([1]);
    await extension.clock.runUntil(run.done);
    expect(extension.clock.now() - startedAt).toBeLessThan(PAGE_TIMEOUT_MS);
    await extension.settle();

    expect(run.results()).toEqual([{ ok: false, error: "unexpected_page" }]);
    expect(extension.tabs.has(101)).toBe(true);
    expect(extension.tabs.log).toEqual([`create inactive ${ORIGINS.mfc}/`]);
  });

  test.each(
    COMMIT_STYLES.flatMap(([styleName, style]) =>
      NEVER_LANDS.flatMap(([name, options]) =>
        [0, 1500].map((loadMs) => [name, loadMs, styleName, style, options] as const),
      ),
    ),
  )(
    "a homepage that %s after %i ms fails as an unexpected page within moments and closes its tab (%s commits)",
    async (_name, loadMs, _styleName, style, options) => {
      const extension = fakeExtension({
        pages: itemPages(),
        navigationMs: () => loadMs,
        deferNavigationCommit: style,
        ...options,
      });
      const startedAt = extension.clock.now();
      const run = extension.run([1]);
      await extension.clock.runUntil(run.done);
      expect(extension.clock.now() - startedAt).toBeLessThan(SHORT_SETTLE_MS);
      await extension.settle();

      expect(run.results()).toEqual([{ ok: false, error: "unexpected_page" }]);
      expect(extension.tabs.log).toEqual([`create inactive ${ORIGINS.mfc}/`, "remove 101"]);
    },
  );

  test.each(
    COMMIT_STYLES.flatMap(([styleName, style]) =>
      [6000, STALLED_LOAD_MS].map((loadMs) => [loadMs, styleName, style] as const),
    ),
  )(
    "a tab the user focuses during a %i ms load is theirs, and the next load waits for that load to end (%s commits)",
    async (loadMs, _styleName, style) => {
      let navigations = 0;
      const extension = fakeExtension({
        pages: itemPages(),
        navigationMs: () => (navigations++ === 0 ? loadMs : 0),
        deferNavigationCommit: style,
      });
      const run = extension.run([1, 2]);
      await extension.clock.runUntil(() => extension.tabs.loads.length === 1);
      await advance(extension.clock, 1000);
      extension.tabs.activate(101);
      await extension.clock.runUntil(run.done);
      await extension.settle();

      expect(run.results().at(-1)).toEqual({ ok: true, html: itemPage(2), picture: null });
      expect(extension.tabs.has(101)).toBe(true);
      expect(tooClose(extension.loads(), THROTTLE.minGapMs)).toEqual([]);
    },
  );

  test("a worker restarted while a load the user took over still runs waits for it to end", async () => {
    let navigations = 0;
    const extension = fakeExtension({
      pages: itemPages(),
      navigationMs: () => (navigations++ === 0 ? STALLED_LOAD_MS : 0),
    });
    extension.run([1]);
    await extension.clock.runUntil(() => extension.tabs.loads.length === 1);
    await advance(extension.clock, 1000);
    extension.tabs.activate(101);
    await advance(extension.clock, PAGE_TIMEOUT_MS + THROTTLE.graceMs);
    extension.restart();
    const next = extension.run([2]);
    await extension.clock.runUntil(next.done);
    await extension.settle();

    expect(next.results()).toEqual([{ ok: true, html: itemPage(2), picture: null }]);
    expect(tooClose(extension.loads(), THROTTLE.minGapMs)).toEqual([]);
  });

  test("a focus between tries at closing the tab, as when the user drags it, keeps it open", async () => {
    const extension = fakeExtension({
      pages: (request) => {
        extension.tabs.drag(101, true);
        return page(itemPage(request.mfcItemId));
      },
    });
    const run = extension.run([1]);
    await extension.clock.runUntil(run.done);
    await advance(extension.clock, 500);
    extension.tabs.activate(101);
    extension.tabs.drag(101, false);
    await extension.settle();

    expect(extension.tabs.has(101)).toBe(true);
  });

  test("a focus that comes while the browser answers the extension keeps the tab open and where it was, at every answer", async () => {
    const outcomes: string[] = [];
    for (let focusAt = 1, tabAnswers = Infinity; focusAt <= tabAnswers; focusAt++) {
      tabAnswers = 0;
      const focuses: { readonly tabId: number; readonly logged: number }[] = [];
      const ownedTab = memoryValue<OwnedTab>(null);
      const ownedPictureTab = memoryValue<OwnedTab>(null);
      const extension: FakeExtension = fakeExtension({
        pages: ({ mfcItemId }) => page(itemPage(mfcItemId, "public")),
        ownedTab,
        ownedPictureTab,
        onTabsAnswer: () => {
          tabAnswers += 1;
          if (tabAnswers !== focusAt) return;
          for (const stored of [ownedTab, ownedPictureTab]) {
            const tabId = stored.peek()?.tabId;
            if (tabId === undefined || !extension.tabs.has(tabId)) continue;
            focuses.push({ tabId, logged: extension.tabs.log.length });
            extension.tabs.activate(tabId);
          }
        },
      });
      const run = extension.run([1, 2]);
      await extension.clock.runUntil(run.done);
      await extension.settle();

      for (const { tabId, logged } of focuses) {
        const touched = extension.tabs.log
          .slice(logged)
          .filter((entry) => entry.startsWith(`update ${tabId} `) || entry === `remove ${tabId}`);
        const state = extension.tabs.has(tabId) ? "open" : "closed";
        outcomes.push([`answer ${focusAt}: ${state}`, ...touched].join(", "));
      }
    }

    expect(outcomes.length).toBeGreaterThan(5);
    expect(outcomes.filter((outcome) => !outcome.endsWith(": open"))).toEqual([]);
  });

  test("an MFC error in a borrowed tab is the item's, with no second try", async () => {
    const extension = fakeExtension({ pages: () => MFC_ERROR });
    extension.tabs.open(`${ORIGINS.mfc}/`);
    const run = extension.run([1]);
    await extension.clock.runUntil(run.done);
    await extension.settle();

    expect(extension.calls).toHaveLength(1);
    expect(extension.tabs.log).toEqual([]);
    expect(run.results()).toEqual([{ ok: false, error: "unexpected_page" }]);
  });

  test("a failed injection in a borrowed tab tries the item once more in its own tab", async () => {
    const extension = fakeExtension({
      pages: (request, _signal, tabId) => {
        if (extension.calls.length === 1) {
          return injectionFailed(tabId, "Cannot access contents of the page.");
        }
        return page(itemPage(request.mfcItemId));
      },
    });
    const borrowed = extension.tabs.open(`${ORIGINS.mfc}/`);
    const run = extension.run([1]);
    await extension.clock.runUntil(run.done);

    expect(extension.calls.map((call) => call.tabId)).toEqual([borrowed, 102]);
    expect(run.results().map((result) => result.ok)).toEqual([true]);
  });

  test("its own tab on the browser's error page fails only the item it was asked for, and the next item loads a fresh tab", async () => {
    const extension = fakeExtension({
      pages: (request, _signal, tabId) => {
        if (tabId === 101) return injectionFailed(tabId, ERROR_PAGE);
        return page(itemPage(request.mfcItemId));
      },
    });
    const run = extension.run([1, 2, 3]);
    await extension.clock.runUntil(run.done);
    await extension.settle();

    expect(run.results().map((result) => result.ok)).toEqual([false, true, true]);
    expect(extension.tabs.log).toEqual([
      `create inactive ${ORIGINS.mfc}/`,
      "remove 101",
      `create inactive ${ORIGINS.mfc}/`,
      "remove 102",
    ]);
    expect(tooClose(extension.loads(), THROTTLE.minGapMs)).toEqual([]);
  });

  test("while every tab of its own shows the browser's error page, each item fails after one fresh tab", async () => {
    const extension = fakeExtension({
      pages: (_request, _signal, tabId) => injectionFailed(tabId, ERROR_PAGE),
    });
    const run = extension.run([1, 2, 3]);
    await extension.clock.runUntil(run.done);
    await extension.settle();

    const failure = { ok: false, error: "unexpected_page" } as const;
    expect(run.results()).toEqual([failure, failure, failure]);
    expect(extension.tabs.log.filter((entry) => entry.startsWith("create"))).toHaveLength(3);
    expect(extension.calls).toHaveLength(3);
    expect(extension.tabs.has(103)).toBe(false);
  });

  test("a collector answer that fails its schema in its own tab fails the item, and the next item loads a fresh tab", async () => {
    const extension = fakeExtension({
      pages: (request, _signal, tabId) =>
        request.mfcItemId === 1 ? answerInvalid(tabId) : page(itemPage(2)),
    });
    const run = extension.run([1, 2]);
    await extension.clock.runUntil(run.done);
    await extension.settle();

    expect(run.results()).toEqual([
      { ok: false, error: "unexpected_page" },
      { ok: true, html: itemPage(2), picture: null },
    ]);
    expect(extension.tabs.log).toEqual([
      `create inactive ${ORIGINS.mfc}/`,
      "remove 101",
      `create inactive ${ORIGINS.mfc}/`,
      "remove 102",
    ]);
  });

  test("a shared item outlives its first run's tab closing before the MFC tab opens", async () => {
    const extension = fakeExtension({ pages: itemPages() });
    const other = extension.tabs.open(`${ORIGINS.web}/sync`, { windowId: OTHER_WINDOW });
    const first = extension.run([1]);
    const second = extension.run([1], { tabId: other, context: NORMAL });

    extension.fetcher.cancel(first.key);
    await extension.tabs.api.remove(extension.myakiba.tabId);
    await extension.clock.runUntil(second.done);

    expect(second.results()).toEqual([{ ok: true, html: itemPage(1), picture: null }]);
    expect(extension.calls[0]?.tab?.windowId).toBe(OTHER_WINDOW);
  });

  test("an MFC tab the user closes while it loads fails its item at once, and the next item opens a fresh tab", async () => {
    let navigations = 0;
    const extension = fakeExtension({
      pages: itemPages(),
      navigationMs: () => (navigations++ === 0 ? 5000 : 0),
    });
    const startedAt = extension.clock.now();
    const run = extension.run([1, 2]);
    await extension.clock.runUntil(() => extension.tabs.loads.length === 1);
    await advance(extension.clock, 1000);
    await extension.tabs.api.remove(101);
    await extension.clock.runUntil(() => run.results().length === 1);
    expect(extension.clock.now() - startedAt).toBeLessThan(SHORT_SETTLE_MS);
    await extension.clock.runUntil(run.done);
    await extension.settle();

    expect(run.results()).toEqual([
      { ok: false, error: "unexpected_page" },
      { ok: true, html: itemPage(2), picture: null },
    ]);
    expect(extension.calls.map((call) => [call.mfcItemId, call.tabId])).toEqual([[itemId(2), 102]]);
    expect(extension.tabs.has(102)).toBe(false);
  });

  test("an item whose run's tab has closed fails without opening an MFC tab", async () => {
    const extension = fakeExtension({ pages: itemPages() });
    const gone = extension.tabs.open(`${ORIGINS.web}/sync`);
    await extension.tabs.api.remove(gone);
    const run = extension.run([1], { tabId: gone, context: NORMAL });
    await extension.clock.runUntil(run.done);
    await extension.settle();

    expect(run.results()).toEqual([{ ok: false, error: "unexpected_page" }]);
    expect(extension.tabs.log).toEqual([`remove ${gone}`]);
  });

  test("an item whose run's tab reports no window fails, and the queue moves on", async () => {
    const extension = fakeExtension({ pages: itemPages() });
    const windowless = extension.tabs.open(`${ORIGINS.web}/sync`);
    extension.tabs.hideWindow(windowless);
    const broken = extension.run([1], { tabId: windowless, context: NORMAL });
    const next = extension.run([2]);
    await extension.clock.runUntil(() => broken.done() && next.done());
    await extension.settle();

    expect(broken.results()).toEqual([{ ok: false, error: "unexpected_page" }]);
    expect(next.results()).toEqual([{ ok: true, html: itemPage(2), picture: null }]);
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

describe("the MFC tab, however the browser shows a load before it commits", () => {
  test.each(COMMIT_STYLES)(
    "a challenge loads in the extension's own tab, which is the user's once shown (%s commits)",
    async (_name, style) => {
      const challenge = challengeOn([7]);
      const extension = fakeExtension({
        pages: challenge.pages,
        navigationMs: () => 1500,
        deferNavigationCommit: style,
      });
      const run = extension.run([7, 8]);
      await extension.clock.runUntil(() => asked(run.events, "needs_user"));
      challenge.solve(extension, 7, 1500);
      await extension.clock.runUntil(run.done);
      await extension.settle();

      expect(run.results().map((result) => result.ok)).toEqual([true, true]);
      expect(extension.tabs.log).toEqual([
        `create inactive ${ORIGINS.mfc}/`,
        `update 101 ${ORIGINS.mfc}/item/7`,
        "update 101 active",
        `update ${extension.myakiba.tabId} active`,
      ]);
      expect(extension.tabs.has(101)).toBe(true);
    },
  );

  test.each(COMMIT_STYLES)(
    "cancelling while the extension's new MFC tab loads closes it, so the next run need not wait it out (%s commits)",
    async (_name, style) => {
      let navigations = 0;
      const extension = fakeExtension({
        pages: itemPages(),
        navigationMs: () => (navigations++ === 0 ? 60_000 : 0),
        deferNavigationCommit: style,
      });
      const cancelled = extension.run([1]);
      await extension.clock.runUntil(() => extension.tabs.loads.length === 1);
      await advance(extension.clock, 1000);
      extension.fetcher.cancel(cancelled.key);
      const cancelledAt = extension.clock.now();
      const next = extension.run([2]);
      await extension.clock.runUntil(next.done);

      expect(extension.tabs.has(101)).toBe(false);
      expect(next.results().map((result) => result.ok)).toEqual([true]);
      const nextPage = extension.calls.find((call) => call.mfcItemId === 2);
      expect((nextPage?.at ?? Infinity) - cancelledAt).toBeLessThan(10_000);
      expect(tooClose(extension.loads(), THROTTLE.minGapMs)).toEqual([]);
    },
  );

  test.each(COMMIT_STYLES)(
    "cancelling while a challenge loads closes its tab, so the next run need not wait it out (%s commits)",
    async (_name, style) => {
      let navigations = 0;
      const extension = fakeExtension({
        pages: challengeOn([7]).pages,
        navigationMs: () => (navigations++ === 1 ? 60_000 : 0),
        deferNavigationCommit: style,
      });
      const cancelled = extension.run([7]);
      await extension.clock.runUntil(() => extension.tabs.loads.length === 2);
      await advance(extension.clock, 1000);
      extension.fetcher.cancel(cancelled.key);
      const cancelledAt = extension.clock.now();
      const next = extension.run([2]);
      await extension.clock.runUntil(next.done);

      expect(extension.tabs.has(101)).toBe(false);
      expect(next.results().map((result) => result.ok)).toEqual([true]);
      const nextPage = extension.calls.find((call) => call.mfcItemId === 2);
      expect((nextPage?.at ?? Infinity) - cancelledAt).toBeLessThan(10_000);
      expect(tooClose(extension.loads(), THROTTLE.minGapMs)).toEqual([]);
    },
  );

  test.each(COMMIT_STYLES)(
    "a page MFC redirects within its origin is still the extension's tab, used and then closed (%s commits)",
    async (_name, style) => {
      const extension = fakeExtension({
        pages: itemPages(),
        navigationMs: () => 1500,
        redirect: (url) => (url === `${ORIGINS.mfc}/` ? `${ORIGINS.mfc}/en/` : undefined),
        deferNavigationCommit: style,
      });
      const run = extension.run([1, 2]);
      await extension.clock.runUntil(run.done);
      await extension.settle();

      expect(run.results().map((result) => result.ok)).toEqual([true, true]);
      expect(extension.calls.map((call) => call.tabId)).toEqual([101, 101]);
      expect(extension.tabs.log).toEqual([`create inactive ${ORIGINS.mfc}/`, "remove 101"]);
    },
  );

  test.each(COMMIT_STYLES)(
    "a new tab the browser calls complete before its load starts is waited for, used and closed (%s commits)",
    async (_name, style) => {
      const extension = fakeExtension({
        pages: itemPages(),
        navigationMs: () => 1500,
        deferNavigationCommit: style,
      });
      const run = extension.run([1]);
      await extension.clock.runUntil(run.done);
      await extension.settle();

      expect(run.results()).toEqual([{ ok: true, html: itemPage(1), picture: null }]);
      expect(extension.calls.map((call) => call.tabId)).toEqual([101]);
      expect(extension.tabs.log).toEqual([`create inactive ${ORIGINS.mfc}/`, "remove 101"]);
    },
  );

  for (const claimed of [false, true]) {
    test.each(COMMIT_STYLES)(
      `a challenge tab cancelled before its load commits is closed only if the user never focused it (${claimed ? "focused" : "not focused"}, %s commits)`,
      async (_name, style) => {
        let navigations = 0;
        const extension = fakeExtension({
          pages: challengeOn([7]).pages,
          navigationMs: () => (navigations++ === 1 ? 6000 : 0),
          deferNavigationCommit: style,
        });
        const run = extension.run([7]);
        await extension.clock.runUntil(() => extension.tabs.loads.length === 2);
        await advance(extension.clock, 1000);
        if (claimed) extension.tabs.activate(101);
        extension.tabs.navigate(101, { url: "https://example.com/", title: "Mine", loadMs: 5000 });
        extension.fetcher.cancel(run.key);
        await extension.settle();

        expect(run.events.at(-1)).toEqual({ type: "done", reason: "cancelled" });
        expect(extension.tabs.has(101)).toBe(claimed);
      },
    );
  }

  for (const end of ["the run is cancelled", "the challenge window ends"] as const) {
    test.each(COMMIT_STYLES)(
      `a shown challenge tab the user navigates away from stays open when ${end} (%s commits)`,
      async (_name, style) => {
        const extension = fakeExtension({
          pages: challengeOn([7]).pages,
          deferNavigationCommit: style,
        });
        const run = extension.run([7]);
        await extension.clock.runUntil(() => asked(run.events, "needs_user"));
        extension.tabs.navigate(101, {
          url: "https://example.com/",
          title: "Mine",
          loadMs: CHALLENGE_WINDOW_MS + 60_000,
        });
        if (end === "the run is cancelled") extension.fetcher.cancel(run.key);
        await extension.clock.runUntil(run.done);
        await extension.settle();

        expect(extension.tabs.has(101)).toBe(true);
        expect(extension.tabs.log).not.toContain("remove 101");
      },
    );
  }
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

  test("a gated picture takes a throttle turn of its own, since it is a request to MFC", async () => {
    const extension = fakeExtension({
      pages: ({ mfcItemId }) => page(itemPage(mfcItemId, "gated")),
      gatedPicture: async (_url, signal) => {
        await extension.clock.sleep(4000, signal);
        return { base64: "/9j/", contentType: "image/jpeg" };
      },
    });
    const run = extension.run([1, 2]);
    await extension.clock.runUntil(run.done);

    expect(run.results().map((result) => result.ok && result.picture !== null)).toEqual([
      true,
      true,
    ]);
    expect(tooClose(extension.loads(), THROTTLE.minGapMs)).toEqual([]);
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
      PICTURE_TIMEOUT_MS + 2 * (THROTTLE.minGapMs + THROTTLE.jitterMs),
    );
  });

  test("a public picture is fetched from the configured static origin", async () => {
    const extension = fakeExtension({ pages: () => page(itemPage(1, "public")) });
    const run = extension.run([1]);
    await extension.clock.runUntil(run.done);

    const url = `${ORIGINS.mfcStatic}/upload/items/1/1.jpg`;
    expect(extension.pictureUrls).toEqual([url]);
    expect(extension.tabs.loads.map((load) => load.url)).toContain(url);
    expect(tooClose(extension.loads(), THROTTLE.minGapMs)).toEqual([]);
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

  test("an item whose gated picture fails still goes through without one", async () => {
    const extension = fakeExtension({
      pages: () => page(itemPage(1, "gated")),
      gatedPicture: () => Promise.reject(new TypeError("Failed to fetch")),
    });
    const run = extension.run([1]);
    await extension.clock.runUntil(run.done);

    expect(run.results()).toEqual([{ ok: true, html: itemPage(1, "gated"), picture: null }]);
  });

  test("a failed picture keeps the item's MFC tab for the next item", async () => {
    const extension = fakeExtension({
      pages: ({ mfcItemId }) => page(itemPage(mfcItemId, "gated")),
      gatedPicture: () => Promise.reject(new TypeError("Failed to fetch")),
    });
    const run = extension.run([1, 2]);
    await extension.clock.runUntil(run.done);
    await extension.settle();

    expect(run.results().map((result) => result.ok && result.picture)).toEqual([null, null]);
    expect(extension.tabs.log).toEqual([`create inactive ${ORIGINS.mfc}/`, "remove 101"]);
  });
});

describe("an attempt that breaks", () => {
  test("a collector that throws a defect fails only its item, and the queue moves on in the same tab", async () => {
    const error = spyOn(console, "error").mockImplementation(() => {});
    try {
      const extension = fakeExtension({
        pages: (request) => {
          if (request.mfcItemId === 1) throw new TypeError("page.html is not a function");
          return page(itemPage(request.mfcItemId));
        },
      });
      const run = extension.run([1, 2]);
      await extension.clock.runUntil(run.done);
      await extension.settle();

      expect(run.results()).toEqual([
        { ok: false, error: "unexpected_page" },
        { ok: true, html: itemPage(2), picture: null },
      ]);
      expect(extension.tabs.log).toEqual([`create inactive ${ORIGINS.mfc}/`, "remove 101"]);
    } finally {
      error.mockRestore();
    }
  });

  test("a collector that throws a defect in a borrowed tab fails its item without a second try", async () => {
    const error = spyOn(console, "error").mockImplementation(() => {});
    try {
      const extension = fakeExtension({
        pages: () => {
          throw new TypeError("page.html is not a function");
        },
      });
      const borrowed = extension.tabs.open(`${ORIGINS.mfc}/`);
      const run = extension.run([1]);
      await extension.clock.runUntil(run.done);

      expect(extension.calls.map((call) => call.tabId)).toEqual([borrowed]);
      expect(run.results()).toEqual([{ ok: false, error: "unexpected_page" }]);
    } finally {
      error.mockRestore();
    }
  });

  test("a throttle write that fails while it records a challenge's pause fails only its item", async () => {
    const extension = fakeExtension({
      throttleState: refusingFirstPause(() =>
        Result.err(
          new SessionStorageUnavailable({
            key: "throttle",
            op: "set",
            cause: new Error("QuotaExceededError"),
          }),
        ),
      ),
      pages: (request) =>
        request.mfcItemId === 7
          ? page(CHALLENGE_PAGE, { status: 503, cfMitigated: "challenge", retryAfter: "5" })
          : page(itemPage(request.mfcItemId)),
    });
    const run = extension.run([7, 8]);
    await extension.clock.runUntil(run.done);
    await extension.settle();

    expect(run.results()).toEqual([
      { ok: false, error: "unexpected_page" },
      { ok: true, html: itemPage(8), picture: null },
    ]);
    expect(asked(run.events, "needs_user")).toBe(false);
  });
});

const COLLECTOR_FAILURES: readonly (readonly [
  string,
  (request: PageRequest, tabId: number) => PageAnswer,
])[] = [
  ["the browser will not inject it", (_request, tabId) => injectionFailed(tabId, ERROR_PAGE)],
  ["its answer is invalid", (_request, tabId) => answerInvalid(tabId)],
  [
    "its fetch fails in the tab",
    (request) => pageFetchFailed(request.mfcItemId, "TypeError", "Failed to fetch"),
  ],
];

describe("a collector run that fails", () => {
  test.each(COLLECTOR_FAILURES)(
    "because %s fails the item in its own tab as unexpected_page and closes that tab",
    async (_name, failure) => {
      const extension = fakeExtension({
        pages: (request, _signal, tabId) =>
          request.mfcItemId === 1 ? failure(request, tabId) : page(itemPage(request.mfcItemId)),
      });
      const run = extension.run([1, 2]);
      await extension.clock.runUntil(run.done);
      await extension.settle();

      expect(run.results()).toEqual([
        { ok: false, error: "unexpected_page" },
        { ok: true, html: itemPage(2), picture: null },
      ]);
      expect(extension.tabs.log).toEqual([
        `create inactive ${ORIGINS.mfc}/`,
        "remove 101",
        `create inactive ${ORIGINS.mfc}/`,
        "remove 102",
      ]);
    },
  );

  test.each(COLLECTOR_FAILURES)(
    "because %s in a borrowed tab tries the item once more in its own tab",
    async (_name, failure) => {
      const extension = fakeExtension({
        pages: (request, _signal, tabId) =>
          tabId === borrowed ? failure(request, tabId) : page(itemPage(request.mfcItemId)),
      });
      const borrowed = extension.tabs.open(`${ORIGINS.mfc}/`);
      const run = extension.run([1]);
      await extension.clock.runUntil(run.done);
      await extension.settle();

      expect(extension.calls.map((call) => call.tabId)).toEqual([borrowed, 102]);
      expect(run.results()).toEqual([{ ok: true, html: itemPage(1), picture: null }]);
    },
  );

  test("because the turn timed out and stopped its fetch, times out and keeps its own tab", async () => {
    const extension = fakeExtension({
      pages: (request, signal) =>
        request.mfcItemId === 1
          ? new Promise((resolve) => {
              signal.addEventListener("abort", () => {
                resolve(pageFetchFailed(request.mfcItemId, "AbortError", "signal is aborted"));
              });
            })
          : page(itemPage(request.mfcItemId)),
    });
    const run = extension.run([1, 2]);
    await extension.clock.runUntil(run.done);
    await extension.settle();

    expect(run.results()).toEqual([
      { ok: false, error: "timeout" },
      { ok: true, html: itemPage(2), picture: null },
    ]);
    expect(extension.tabs.log).toEqual([`create inactive ${ORIGINS.mfc}/`, "remove 101"]);
  });
});

const PICTURE_FAILURES: readonly (readonly [string, () => PictureAnswer])[] = [
  [
    "it drops what MFC served",
    () => Result.err(new PictureRejected({ reason: "http_status", status: 404, bytes: null })),
  ],
  [
    "its fetch fails in the tab",
    () =>
      Result.err(
        new PictureFetchFailed({ cause: { name: "TypeError", message: "Failed to fetch" } }),
      ),
  ],
  [
    "its own timer stops it",
    () => Result.err(new PictureTimedOut({ timeoutMs: PICTURE_TIMEOUT_MS })),
  ],
  [
    "the browser will not inject it",
    () =>
      Result.err(
        new CollectorInjectionFailed({
          tabId: 101,
          kind: "gated-picture",
          cause: new Error(ERROR_PAGE),
        }),
      ),
  ],
  [
    "its answer is invalid",
    () => Result.err(new CollectorAnswerInvalid({ tabId: 101, kind: "gated-picture", issues: [] })),
  ],
];

describe("a picture read that fails", () => {
  let warn: Mock<typeof console.warn>;

  beforeEach(() => {
    warn = spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  test.each(PICTURE_FAILURES)(
    "because %s imports a gated picture's item without it and keeps the MFC tab",
    async (_name, failure) => {
      const extension = fakeExtension({
        pages: ({ mfcItemId }) => page(itemPage(mfcItemId, "gated")),
        gatedPicture: async () => failure(),
      });
      const run = extension.run([1, 2]);
      await extension.clock.runUntil(run.done);
      await extension.settle();

      expect(run.results()).toEqual([
        { ok: true, html: itemPage(1, "gated"), picture: null },
        { ok: true, html: itemPage(2, "gated"), picture: null },
      ]);
      expect(extension.tabs.log).toEqual([`create inactive ${ORIGINS.mfc}/`, "remove 101"]);
    },
  );

  test.each(PICTURE_FAILURES)(
    "because %s imports a public picture's item without it",
    async (_name, failure) => {
      const extension = fakeExtension({
        pages: ({ mfcItemId }) => page(itemPage(mfcItemId, "public")),
        publicPicture: async () => failure(),
      });
      const run = extension.run([1, 2]);
      await extension.clock.runUntil(run.done);

      expect(run.results()).toEqual([
        { ok: true, html: itemPage(1, "public"), picture: null },
        { ok: true, html: itemPage(2, "public"), picture: null },
      ]);
    },
  );
});

describe("a picture read that hits a defect in the tab", () => {
  let error: Mock<typeof console.error>;

  beforeEach(() => {
    error = spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    error.mockRestore();
  });

  const defect = () =>
    Promise.reject(
      new Panic({ message: "andThen callback threw", cause: new TypeError("not a function") }),
    );

  test.each([
    ["gated", { gatedPicture: defect }],
    ["public", { publicPicture: defect }],
  ] as const)(
    "fails a %s picture's item as unexpected_page, reports the Panic, and the queue moves on",
    async (access, readPicture) => {
      const extension = fakeExtension({
        pages: ({ mfcItemId }) => page(itemPage(mfcItemId, mfcItemId === 1 ? access : null)),
        ...readPicture,
      });
      const run = extension.run([1, 2]);
      await extension.clock.runUntil(run.done);

      expect(run.results()).toEqual([
        { ok: false, error: "unexpected_page" },
        { ok: true, html: itemPage(2), picture: null },
      ]);
      expect(error).toHaveBeenCalledTimes(1);
      expect(Panic.is(error.mock.calls[0]?.[1])).toBe(true);
    },
  );
});

describe("a collector run that the turn stopped", () => {
  test("answers its abandoned run as the turn's timeout and keeps its own tab", async () => {
    const extension = fakeExtension({
      pages: (request, signal, tabId) =>
        request.mfcItemId === 1
          ? new Promise((resolve) => {
              signal.addEventListener("abort", () => resolve(injectionFailed(tabId, "stopped")));
            })
          : page(itemPage(request.mfcItemId)),
    });
    const run = extension.run([1, 2]);
    await extension.clock.runUntil(run.done);
    await extension.settle();

    expect(run.results()).toEqual([
      { ok: false, error: "timeout" },
      { ok: true, html: itemPage(2), picture: null },
    ]);
    expect(extension.tabs.log).toEqual([`create inactive ${ORIGINS.mfc}/`, "remove 101"]);
  });
});

describe("a tab focus", () => {
  test("that cannot be recorded answers SessionStorageUnavailable", async () => {
    const stored = memoryValue<OwnedTab>({ state: "landed", tabId: 5 });
    const extension = fakeExtension({
      pages: itemPages(),
      ownedTab: {
        load: stored.load,
        save: async () =>
          Result.err(new SessionStorageUnavailable({ key: "ownedTab", op: "set", cause: null })),
      },
    });
    const noted = await extension.fetcher.noteTabActivated(5);

    expect(noted.isErr() && noted.error).toMatchObject({
      _tag: "SessionStorageUnavailable",
      key: "ownedTab",
    });
  });

  test("that is recorded answers Ok and makes the tab the user's", async () => {
    const ownedTab = memoryValue<OwnedTab>({ state: "landed", tabId: 5 });
    const extension = fakeExtension({ pages: itemPages(), ownedTab });
    const noted = await extension.fetcher.noteTabActivated(5);

    expect(noted.isOk()).toBe(true);
    expect(ownedTab.peek()).toBeNull();
  });
});

describe("the developer log", () => {
  let warn: Mock<typeof console.warn>;
  let error: Mock<typeof console.error>;
  const warned = () => warn.mock.calls.map((call) => call.join(" "));

  beforeEach(() => {
    warn = spyOn(console, "warn").mockImplementation(() => {});
    error = spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
    error.mockRestore();
  });

  test("names each failed item's error and id once, without the page", async () => {
    const extension = fakeExtension({
      pages: ({ mfcItemId }) =>
        mfcItemId === 1 ? page(notFoundPage(false), { status: 404 }) : page(itemPage(99)),
    });
    const run = extension.run([1, 2]);
    await extension.clock.runUntil(run.done);

    expect(warned()).toHaveLength(2);
    expect(warned()[0]).toContain("MfcSignedOut for MFC item 1:");
    expect(warned()[1]).toContain("MfcWrongItem for MFC item 2:");
    expect(warned().join("\n")).not.toContain("<html");
    expect(error).not.toHaveBeenCalled();
  });

  test("stays quiet for an item that imports, a rate limit it backs off from and a cancelled item", async () => {
    let limited = false;
    const extension = fakeExtension({
      pages: ({ mfcItemId }) => {
        if (mfcItemId !== 1 || limited) return page(itemPage(mfcItemId));
        limited = true;
        return rateLimited("5");
      },
      navigationMs: () => 5000,
    });
    const run = extension.run([1]);
    await extension.clock.runUntil(run.done);
    const cancelled = extension.run([2]);
    await extension.clock.runUntil(() => extension.tabs.loads.length > 0);
    extension.fetcher.cancel(cancelled.key);
    await extension.settle();

    expect(run.results()).toEqual([{ ok: true, html: itemPage(1), picture: null }]);
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  test("names a failed picture's error, item id and reason once, without its URL or bytes", async () => {
    const extension = fakeExtension({
      pages: ({ mfcItemId }) => page(itemPage(mfcItemId, "gated")),
      gatedPicture: async () =>
        Result.err(new PictureRejected({ reason: "unknown_format", status: 200, bytes: 512 })),
    });
    const run = extension.run([4]);
    await extension.clock.runUntil(run.done);

    expect(run.results()).toEqual([{ ok: true, html: itemPage(4, "gated"), picture: null }]);
    expect(warned()).toEqual([
      expect.stringContaining("PictureRejected for MFC item 4's picture:"),
    ]);
    expect(warned()[0]).toContain("unknown_format");
    expect(warned()[0]).not.toContain("objectId");
    expect(warned()[0]).not.toContain("myfigurecollection.net");
    expect(error).not.toHaveBeenCalled();
  });

  test("stays quiet for a picture whose run was cancelled while it loaded", async () => {
    const extension = fakeExtension({
      pages: ({ mfcItemId }) => page(itemPage(mfcItemId, "gated")),
      gatedPicture: async (_url, signal) => {
        await extension.clock.sleep(PICTURE_TIMEOUT_MS, signal);
        return null;
      },
    });
    const run = extension.run([5]);
    await extension.clock.runUntil(() => extension.pictureUrls.length > 0);
    extension.fetcher.cancel(run.key);
    await extension.settle();

    expect(run.results()).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  test.each([
    ["closed", (extension: FakeExtension) => extension.tabs.api.remove(101)],
    ["taken", (extension: FakeExtension) => extension.tabs.activate(101)],
  ] as const)(
    "names why the extension gave its tab up when it was %s while it loaded",
    async (reason, lose) => {
      let navigations = 0;
      const extension = fakeExtension({
        pages: itemPages(),
        navigationMs: () => (navigations++ === 0 ? 5000 : 0),
      });
      const run = extension.run([1]);
      await extension.clock.runUntil(() => extension.tabs.loads.length === 1);
      await lose(extension);
      await extension.clock.runUntil(run.done);

      expect(run.results()).toEqual([{ ok: false, error: "unexpected_page" }]);
      expect(warned()).toEqual([expect.stringContaining("MfcTabUnavailable for MFC item 1:")]);
      expect(warned()[0]).toContain(`as ${reason},`);
    },
  );

  test("names a new tab whose load ended off MFC's origin", async () => {
    const extension = fakeExtension({
      pages: itemPages(),
      redirect: (url) => (url === HOMEPAGE ? "https://example.com/" : undefined),
    });
    const run = extension.run([1]);
    await extension.clock.runUntil(run.done);

    expect(run.results()).toEqual([{ ok: false, error: "unexpected_page" }]);
    expect(warned()).toEqual([expect.stringContaining("as left_origin,")]);
  });

  test("names a challenge load that ended back on the page its tab showed", async () => {
    const challenge = challengeOn([7]);
    const extension = fakeExtension({
      pages: challenge.pages,
      dropsNavigation: (url) => url === `${ORIGINS.mfc}/item/7`,
    });
    const run = extension.run([7]);
    await extension.clock.runUntil(run.done);

    expect(run.results()).toEqual([{ ok: false, error: "challenge_unsolved" }]);
    expect(warned()).toEqual([expect.stringContaining("MfcChallengeUnsolved for MFC item 7:")]);
    expect(warned()[0]).toContain("as ended_at_start,");
  });

  test("names a run's tab that closed before its MFC tab opened", async () => {
    const extension = fakeExtension({ pages: itemPages() });
    const gone = extension.tabs.open(`${ORIGINS.web}/sync`);
    await extension.tabs.api.remove(gone);
    const run = extension.run([1], { tabId: gone, context: NORMAL });
    await extension.clock.runUntil(run.done);

    expect(warned()).toEqual([expect.stringContaining("TabClosed for MFC item 1:")]);
    expect(warned()[0]).toContain(`tab ${gone}`);
  });

  test("names the refused focus behind a challenge that could not be shown", async () => {
    const challenge = challengeOn([7]);
    const extension = fakeExtension({
      pages: (request) => {
        extension.tabs.drag(extension.myakiba.tabId, true);
        return challenge.pages(request);
      },
    });
    const run = extension.run([7]);
    await extension.clock.runUntil(run.done);

    expect(warned()).toEqual([expect.stringContaining("MfcChallengeUnsolved for MFC item 7:")]);
    expect(warned()[0]).toContain("refused to update tab 101");
  });

  test("reports a run's tab without a window as a defect with its Panic", async () => {
    const extension = fakeExtension({ pages: itemPages() });
    const windowless = extension.tabs.open(`${ORIGINS.web}/sync`);
    extension.tabs.hideWindow(windowless);
    const run = extension.run([1], { tabId: windowless, context: NORMAL });
    await extension.clock.runUntil(run.done);

    expect(run.results()).toEqual([{ ok: false, error: "unexpected_page" }]);
    expect(warn).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledTimes(1);
    const [, defect] = error.mock.calls[0] ?? [];
    expect(Panic.is(defect)).toBe(true);
    expect(String(defect instanceof Error ? defect.stack : defect)).toContain(
      `answered tab ${windowless} with no windowId`,
    );
  });

  test("names a challenge's pause that cannot be booked, and fails only its item", async () => {
    const extension = fakeExtension({
      throttleState: refusingFirstPause(() =>
        Result.err(new SessionStorageUnavailable({ key: "throttle", op: "set", cause: null })),
      ),
      pages: (request) =>
        request.mfcItemId === 7
          ? page(CHALLENGE_PAGE, { status: 503, cfMitigated: "challenge", retryAfter: "5" })
          : page(itemPage(request.mfcItemId)),
    });
    const run = extension.run([7, 8]);
    await extension.clock.runUntil(run.done);

    expect(run.results()).toEqual([
      { ok: false, error: "unexpected_page" },
      { ok: true, html: itemPage(8), picture: null },
    ]);
    expect(warned()).toEqual([
      expect.stringContaining(
        "SessionStorageUnavailable for MFC item 7: storage.session would not set throttle",
      ),
    ]);
    expect(error).not.toHaveBeenCalled();
  });

  test("names a solved challenge's reload that cannot be booked, and fails its item", async () => {
    const challenge = challengeOn([7]);
    const stored = memoryValue(OPEN_THROTTLE);
    let failNext = false;
    const extension = fakeExtension({
      throttleState: {
        load: stored.load,
        save: async (next) => {
          if (!failNext) return stored.save(next);
          failNext = false;
          return Result.err(
            new SessionStorageUnavailable({ key: "throttle", op: "set", cause: null }),
          );
        },
      },
      pages: challenge.pages,
    });
    const run = extension.run([7]);
    await extension.clock.runUntil(() => asked(run.events, "needs_user"));
    failNext = true;
    challenge.solve(extension, 7);
    await extension.clock.runUntil(run.done);

    expect(run.results()).toEqual([{ ok: false, error: "unexpected_page" }]);
    expect(warned()).toEqual([
      expect.stringContaining("SessionStorageUnavailable for MFC item 7:"),
    ]);
  });

  test("reports an unexpected throw from the collector as a defect with its Panic", async () => {
    const extension = fakeExtension({
      pages: () => {
        throw new TypeError("page.html is not a function");
      },
    });
    const run = extension.run([3]);
    await extension.clock.runUntil(run.done);

    expect(warn).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledTimes(1);
    const [message, defect] = error.mock.calls[0] ?? [];
    expect(String(message)).toContain("MFC item 3");
    expect(Panic.is(defect)).toBe(true);
  });

  test("reports a defect inside the attempt as an error with its Panic", async () => {
    const extension = fakeExtension({
      throttleState: refusingFirstPause(() => {
        throw new Error("QuotaExceededError");
      }),
      pages: () => page(CHALLENGE_PAGE, { status: 503, cfMitigated: "challenge", retryAfter: "5" }),
    });
    const run = extension.run([7]);
    await extension.clock.runUntil(run.done);

    expect(run.results()).toEqual([{ ok: false, error: "unexpected_page" }]);
    expect(warn).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledTimes(1);
    const [message, defect] = error.mock.calls[0] ?? [];
    expect(String(message)).toContain("MFC item 7");
    expect(Panic.is(defect)).toBe(true);
  });
});
