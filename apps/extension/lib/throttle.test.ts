import { describe, expect, test } from "bun:test";
import { Result } from "better-result";
import { fakeClock, memoryValue } from "../test/fake-browser";
import { AttemptAbandoned } from "./errors/attempt-abandoned";
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

  test("whose attempt was abandoned answers AttemptAbandoned without running its work", async () => {
    const { throttle } = turns();
    const cancelled = new AbortController();
    cancelled.abort();
    let ran = false;
    const turn = await throttle.load(cancelled.signal, async () => {
      ran = true;
      return Result.ok(null);
    });

    expect(turn.isErr() && AttemptAbandoned.is(turn.error)).toBe(true);
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

  test("whose books cannot be read answers SessionStorageUnavailable without running its work", async () => {
    const { clock } = turns();
    const unavailable = new SessionStorageUnavailable({ key: "throttle", op: "get", cause: null });
    const throttle = createThrottle({
      clock,
      random: () => 0.5,
      state: { load: async () => Result.err(unavailable), save: async () => Result.ok() },
    });
    let ran = false;
    const turn = await throttle.load(new AbortController().signal, async () => {
      ran = true;
      return Result.ok(null);
    });

    expect(turn.isErr() && turn.error).toBe(unavailable);
    expect(ran).toBe(false);
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
