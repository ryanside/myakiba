import { describe, expect, test } from "bun:test";
import { memoryValue } from "../test/fake-browser";
import { OPEN_THROTTLE, THROTTLE, createThrottle, parseRetryAfter } from "./throttle";
import type { Throttle } from "./throttle";

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
