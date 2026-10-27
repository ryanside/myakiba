import { describe, expect, spyOn, test } from "bun:test";
import { Panic, Result } from "better-result";
import { fakeClock, memoryValue } from "../test/fake-browser";
import { MfcQueueHalted } from "./errors/mfc-queue-halted";
import { SessionStorageUnavailable } from "./errors/session-storage-unavailable";
import { OPEN_THROTTLE, THROTTLE, createThrottle, parseRetryAfter } from "./throttle";
import type { Throttle, TurnFailure } from "./throttle";

const START = 1_000_000;
const MINUTE = 60_000;

function books() {
  let now = START;
  const state = memoryValue(OPEN_THROTTLE);
  const clock = { now: () => now, sleep: async () => {} };
  const start = () => createThrottle({ clock, random: () => 0.5, state });
  return {
    start,
    state,
    at: (ms: number) => {
      now = START + ms;
      return now;
    },
  };
}

async function haltOf(throttle: Throttle, pausedUntil: number): Promise<number | null> {
  const limited = await throttle.rateLimited(pausedUntil);
  return limited.unwrap().haltedUntil;
}

describe("MFC's answers on the books", () => {
  test("a second rate limit within ten minutes halts for five minutes, or twice what MFC asked", async () => {
    const { start, at } = books();
    const throttle = start();

    expect(await haltOf(throttle, at(0) + 5000)).toBeNull();
    expect(await haltOf(throttle, at(MINUTE) + 5000)).toBe(at(MINUTE) + THROTTLE.maxPauseMs);
    expect(await haltOf(throttle, at(20 * MINUTE) + 200_000)).toBeNull();
    expect(await haltOf(throttle, at(25 * MINUTE) + 200_000)).toBe(at(25 * MINUTE) + 400_000);
  });

  test("a rate limit more than ten minutes after the last only pauses", async () => {
    const { start, at } = books();
    const throttle = start();

    expect(await haltOf(throttle, at(0) + 5000)).toBeNull();
    expect(await haltOf(throttle, at(THROTTLE.inRowMs + 1) + 5000)).toBeNull();
  });

  test("any other answer between two rate limits ends the row", async () => {
    const { start, at } = books();
    const throttle = start();

    await haltOf(throttle, at(0) + 5000);
    await throttle.answered();
    expect(await haltOf(throttle, at(MINUTE) + 5000)).toBeNull();
  });

  test("a pause over five minutes halts at once, and the first limit after a halt only pauses", async () => {
    const { start, at } = books();
    const throttle = start();

    expect(await haltOf(throttle, at(0) + THROTTLE.maxPauseMs + 1)).toBe(
      at(0) + THROTTLE.maxPauseMs + 1,
    );
    expect(await haltOf(throttle, at(6 * MINUTE) + 5000)).toBeNull();
  });

  test("a restarted worker keeps both the halt and a row of limits", async () => {
    const { start, state, at } = books();
    expect(await haltOf(start(), at(0) + 5000)).toBeNull();
    expect(await haltOf(start(), at(MINUTE) + 5000)).toBe(at(MINUTE) + THROTTLE.maxPauseMs);

    expect(state.peek().haltedUntil).toBe(at(MINUTE) + THROTTLE.maxPauseMs);
  });
});

describe("a throttle turn", () => {
  function turns(initial = OPEN_THROTTLE) {
    const clock = fakeClock(START);
    const state = memoryValue(initial);
    const throttle = createThrottle({ clock, random: () => 0.5, state });
    return { clock, state, throttle };
  }

  test("runs its work and answers what the work answers", async () => {
    const { throttle } = turns();
    const turn = await throttle.load(new AbortController().signal, async () => Result.ok(7), 1000);

    expect(turn.isOk() && turn.value).toBe(7);
  });

  test("while the queue is halted, answers MfcQueueHalted without running its work or writing the books", async () => {
    const halted = { ...OPEN_THROTTLE, haltedUntil: START + MINUTE };
    const { throttle, state } = turns(halted);
    let ran = false;
    const turn = await throttle.load(new AbortController().signal, async () => {
      ran = true;
      return Result.ok(null);
    });

    expect(turn.isErr() && MfcQueueHalted.is(turn.error) && turn.error.until).toBe(START + MINUTE);
    expect(ran).toBe(false);
    expect(state.peek()).toEqual(halted);
  });

  test("whose attempt was abandoned fails without running its work", async () => {
    const { throttle } = turns();
    const cancelled = new AbortController();
    cancelled.abort();
    let ran = false;
    const turn = await throttle.load(cancelled.signal, async () => {
      ran = true;
      return Result.ok(null);
    });

    expect(turn.isErr()).toBe(true);
    expect(ran).toBe(false);
  });

  test("whose work never answers times out once its grace has run out", async () => {
    const { clock, throttle } = turns();
    let answer: Result<never, TurnFailure> | null = null;
    void throttle
      .load<never, never>(new AbortController().signal, () => new Promise<never>(() => {}), 1000)
      .then((turn) => {
        answer = turn;
      });
    await clock.runUntil(() => answer !== null);

    expect(clock.now() - START).toBe(1000 + THROTTLE.graceMs);
    expect(answer).toMatchObject({
      status: "error",
      error: { _tag: "MfcLoadTimedOut", timeoutMs: 1000 },
    });
  });

  test("reads an error its work answers after the timeout stopped it as that timeout", async () => {
    const { clock, throttle } = turns();
    let answer: Result<never, Error | TurnFailure> | null = null;
    void throttle
      .load<never, Error>(
        new AbortController().signal,
        (timeout) =>
          new Promise<Result<never, Error>>((resolve) => {
            timeout.addEventListener("abort", () => resolve(Result.err(new Error("aborted"))));
          }),
        1000,
      )
      .then((turn) => {
        answer = turn;
      });
    await clock.runUntil(() => answer !== null);

    expect(clock.now() - START).toBe(1000);
    expect(answer).toMatchObject({ status: "error", error: { _tag: "MfcLoadTimedOut" } });
  });

  test("whose books storage will not read runs on an open throttle and logs why", async () => {
    const { clock } = turns();
    const unavailable = new SessionStorageUnavailable({ key: "throttle", op: "get", cause: null });
    const throttle = createThrottle({
      clock,
      random: () => 0.5,
      state: { load: async () => Result.err(unavailable), save: async () => Result.ok() },
    });
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      const turn = await throttle.load(
        new AbortController().signal,
        async () => Result.ok(7),
        1000,
      );

      expect(turn.isOk() && turn.value).toBe(7);
      expect(warn.mock.calls.map((call) => String(call[0]))).toEqual([
        `SessionStorageUnavailable: ${unavailable.message}`,
      ]);
    } finally {
      warn.mockRestore();
    }
  });

  test("reads its books from storage once, however many turns it runs", async () => {
    const { clock } = turns();
    const stored = memoryValue(OPEN_THROTTLE);
    let reads = 0;
    const throttle = createThrottle({
      clock,
      random: () => 0.5,
      state: {
        load: () => {
          reads += 1;
          return stored.load();
        },
        save: stored.save,
      },
    });
    let done = false;
    void Promise.all(
      [1, 2, 3].map((value) =>
        throttle.load(new AbortController().signal, async () => Result.ok(value), 1000),
      ),
    ).then(() => {
      done = true;
    });
    await clock.runUntil(() => done);

    expect(reads).toBe(1);
  });

  test("whose booking storage will not write still keeps the next turn a gap after it, and logs why", async () => {
    const { clock } = turns();
    const throttle = createThrottle({
      clock,
      random: () => 0.5,
      state: {
        load: async () => Result.ok(OPEN_THROTTLE),
        save: async () =>
          Result.err(new SessionStorageUnavailable({ key: "throttle", op: "set", cause: null })),
      },
    });
    const error = spyOn(console, "error").mockImplementation(() => {});
    try {
      const startedAt: number[] = [];
      let done = false;
      void Promise.all(
        [1, 2].map((value) =>
          throttle.load(new AbortController().signal, async () => {
            startedAt.push(clock.now());
            return Result.ok(value);
          }),
        ),
      ).then(() => {
        done = true;
      });
      await clock.runUntil(() => done);

      expect((startedAt[1] ?? 0) - (startedAt[0] ?? 0)).toBe(
        THROTTLE.minGapMs + THROTTLE.jitterMs / 2,
      );
      expect(error.mock.calls.map((call) => String(call[0]))).toContain(
        "could not book the end of an MFC page load",
      );
    } finally {
      error.mockRestore();
    }
  });

  test("whose reservation panics lets the next load run", async () => {
    const { clock } = turns();
    const stored = memoryValue(OPEN_THROTTLE);
    let reads = 0;
    const throttle = createThrottle({
      clock,
      random: () => 0.5,
      state: {
        load: () => {
          reads += 1;
          if (reads === 1) throw new Error("the books broke");
          return stored.load();
        },
        save: stored.save,
      },
    });

    await expect(
      throttle.load(new AbortController().signal, async () => Result.ok(null)),
    ).rejects.toBeInstanceOf(Panic);

    let answer: Result<number, TurnFailure> | null = null;
    void throttle
      .load(new AbortController().signal, async () => Result.ok(7), 1000)
      .then((turn) => {
        answer = turn;
      });
    await clock.runUntil(() => answer !== null);

    expect(answer).toMatchObject({ status: "ok", value: 7 });
  });

  // bun fails the test on an unhandled rejection, so these loads also prove the defect is never left unhandled.
  test("whose end of turn panics while it is booked reports it once and lets the next loads run", async () => {
    const { clock } = turns();
    const stored = memoryValue(OPEN_THROTTLE);
    let saves = 0;
    const throttle = createThrottle({
      clock,
      random: () => 0.5,
      state: {
        load: stored.load,
        save: (next) => {
          saves += 1;
          // The first load's reservation is the first save, and the end of its turn the second.
          if (saves === 2) throw new Error("the books broke");
          return stored.save(next);
        },
      },
    });
    const error = spyOn(console, "error").mockImplementation(() => {});
    try {
      const loads = Promise.allSettled(
        [1, 2, 3].map((value) =>
          throttle.load(new AbortController().signal, async () => Result.ok(value), 1000),
        ),
      );
      await clock.runUntilIdle();
      // A real tick, so bun sees any rejection left unhandled while this test still runs.
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });

      expect(await loads).toMatchObject([
        { status: "fulfilled", value: { status: "ok", value: 1 } },
        { status: "fulfilled", value: { status: "ok", value: 2 } },
        { status: "fulfilled", value: { status: "ok", value: 3 } },
      ]);
      expect(error).toHaveBeenCalledTimes(1);
      expect(error.mock.calls[0]?.[1]).toBeInstanceOf(Panic);
    } finally {
      error.mockRestore();
    }
  });

  test.each([
    ["pauseOrHalt", (throttle: Throttle) => throttle.pauseOrHalt(START + 5000)],
    ["rateLimited", (throttle: Throttle) => throttle.rateLimited(START + 5000)],
    ["answered", (throttle: Throttle) => throttle.answered()],
    ["noteLoad", (throttle: Throttle) => throttle.noteLoad()],
  ] as const)(
    "%s answers a write it could not make as SessionStorageUnavailable",
    async (_name, book) => {
      const stored = memoryValue(OPEN_THROTTLE);
      const throttle = createThrottle({
        clock: fakeClock(START),
        random: () => 0.5,
        state: {
          load: stored.load,
          save: async () =>
            Result.err(new SessionStorageUnavailable({ key: "throttle", op: "set", cause: null })),
        },
      });
      const written = await book(throttle);

      expect(written.isErr() && SessionStorageUnavailable.is(written.error)).toBe(true);
      expect(stored.peek()).toEqual(OPEN_THROTTLE);
    },
  );
});

describe("parseRetryAfter", () => {
  const now = Date.parse("2026-10-21T12:00:00Z");

  test.each([
    ["5", 5000],
    ["0", 0],
    ["Wed, 21 Oct 2026 12:00:30 GMT", 30_000],
    ["Wed, 21 Oct 2026 11:00:00 GMT", 0],
    ["soon", null],
    ["", null],
    [null, null],
  ])("%p is %p ms", (header, expected) => {
    expect(parseRetryAfter(header, now)).toBe(expected);
  });
});
