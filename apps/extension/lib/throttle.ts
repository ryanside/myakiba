import * as z from "zod";
import type { Clock, SessionValue } from "./clock";
import { TimeoutError, timeoutSignal, unlessAborted } from "./clock";
import { PAGE_TIMEOUT_MS } from "./collect";

export const THROTTLE = {
  minGapMs: 2500,
  jitterMs: 1000,
  defaultPauseMs: 15_000,
  /** A longer pause halts the queue instead of keeping the user waiting. */
  maxPauseMs: 5 * 60_000,
  /** How long a load that timed out may take to stop in its tab. */
  graceMs: 5000,
  /** A rate limit this soon after the last one, with no other answer between them, is in a row. */
  inRowMs: 10 * 60_000,
} as const;

/** Kept in storage.session, so a restarted worker keeps MFC's pause, its halt and a run of limits. */
export const throttleStateSchema = z.strictObject({
  nextPageAt: z.number(),
  pausedUntil: z.number(),
  /** New runs fail with rate_limited until then, without a load. */
  haltedUntil: z.number(),
  /** When MFC last answered with a rate limit, or null once it answered any other way. */
  limitedAt: z.number().nullable(),
});
export type ThrottleState = z.output<typeof throttleStateSchema>;

export const OPEN_THROTTLE: ThrottleState = {
  nextPageAt: 0,
  pausedUntil: 0,
  haltedUntil: 0,
  limitedAt: null,
};

export class HaltedError extends Error {
  readonly until: number;

  constructor(until: number) {
    super(`MFC halted the queue until ${new Date(until).toISOString()}`);
    this.name = "HaltedError";
    this.until = until;
  }
}

/** MFC's pause. One too long to wait out halts the queue until it ends instead. */
function paused(current: ThrottleState, until: number, now: number): ThrottleState {
  const haltedUntil = until - now > THROTTLE.maxPauseMs ? until : 0;
  return {
    ...current,
    pausedUntil: Math.max(current.pausedUntil, until),
    haltedUntil: Math.max(current.haltedUntil, haltedUntil),
  };
}

async function stopped(settled: Promise<void>): Promise<never> {
  await settled;
  throw new TimeoutError(PAGE_TIMEOUT_MS);
}

/** The load's result. A load that timed out answers only once it has stopped, so its caller never moves on while it still runs. */
async function answerOf<T>(
  running: Promise<T>,
  settled: Promise<void>,
  timeout: AbortSignal,
): Promise<T> {
  try {
    return await Promise.race([running, stopped(settled)]);
  } catch (error) {
    throw timeout.aborted ? timeout.reason : error;
  }
}

export function createThrottle(deps: {
  readonly clock: Clock;
  readonly random: () => number;
  readonly state: SessionValue<ThrottleState>;
}) {
  const { clock, random, state } = deps;
  /**
   * Settles once the last load this worker started has ended and is on the books. Only this worker sees it,
   * so its next load can start a gap after that real end rather than when the reservation runs out.
   */
  let lastLoad: Promise<unknown> = Promise.resolve();
  let books: Promise<unknown> = Promise.resolve();

  const gapAfter = (at: number) =>
    at + THROTTLE.minGapMs + Math.floor(random() * THROTTLE.jitterMs);

  /** Reads and writes the books one change at a time, so no change overwrites another. */
  async function book<R>(
    change: (current: ThrottleState, now: number) => [ThrottleState, R],
  ): Promise<R> {
    const previous = books;
    const turn = Promise.withResolvers<null>();
    books = turn.promise;
    try {
      await previous;
      const [next, result] = change(await state.load(), clock.now());
      await state.save(next);
      return result;
    } finally {
      turn.resolve(null);
    }
  }

  async function reserve(signal: AbortSignal): Promise<void> {
    for (;;) {
      signal.throwIfAborted();
      const wait = await book((current, now): [ThrottleState, number] => {
        if (now < current.haltedUntil) throw new HaltedError(current.haltedUntil);
        const untilFree = Math.max(current.nextPageAt, current.pausedUntil) - now;
        if (untilFree > 0) return [current, untilFree];
        // Booked to the latest this load can end, so a worker that stops mid-load leaves the next one waiting it out.
        return [{ ...current, nextPageAt: gapAfter(now + PAGE_TIMEOUT_MS + THROTTLE.graceMs) }, 0];
      });
      if (wait <= 0) return;
      await clock.sleep(wait, signal);
    }
  }

  async function settle(running: Promise<unknown>, finished: AbortController): Promise<void> {
    const grace = new AbortController();
    await Promise.race([
      Promise.allSettled([running]),
      clock.sleep(PAGE_TIMEOUT_MS + THROTTLE.graceMs, grace.signal),
    ]);
    grace.abort();
    finished.abort();
    try {
      await book((current, now) => [{ ...current, nextPageAt: gapAfter(now) }, null]);
    } catch (error) {
      console.error("could not book the end of an MFC page load", error);
    }
  }

  return {
    /**
     * Runs one MFC page load in its turn. `work` gets a signal that aborts once the load times out, and then stops the load.
     * The next turn starts a gap after this load ends, even when the caller stopped waiting first.
     */
    async load<T>(signal: AbortSignal, work: (timeout: AbortSignal) => Promise<T>): Promise<T> {
      const previous = lastLoad;
      const ended = Promise.withResolvers<unknown>();
      lastLoad = Promise.all([previous, ended.promise]);
      try {
        await unlessAborted(signal, previous);
        await reserve(signal);
      } catch (error) {
        ended.resolve(null);
        throw error;
      }
      const finished = new AbortController();
      const timeout = timeoutSignal(clock, PAGE_TIMEOUT_MS, finished.signal);
      const running = signal.aborted ? Promise.reject(signal.reason) : work(timeout);
      const settled = settle(running, finished);
      ended.resolve(settled);
      return unlessAborted(signal, answerOf(running, settled, timeout));
    },

    /** Books a pause MFC asked for along with a challenge. One too long to wait out halts the queue. */
    async pause(until: number): Promise<void> {
      await book((current, now) => [paused(current, until, now), null]);
    },

    /**
     * Books MFC's answer to an item: the pause it asked for with a rate limit, or null for any other answer.
     * @returns when a halt ends, for a limit in a row or a pause too long to wait out, or null.
     */
    async answered(pausedUntil: number | null): Promise<number | null> {
      return book((current, now): [ThrottleState, number | null] => {
        if (pausedUntil === null) return [{ ...current, limitedAt: null }, null];
        const pauseMs = pausedUntil - now;
        const inRow = current.limitedAt !== null && now - current.limitedAt <= THROTTLE.inRowMs;
        let haltedUntil: number | null = null;
        if (pauseMs > THROTTLE.maxPauseMs) haltedUntil = pausedUntil;
        else if (inRow) haltedUntil = now + Math.max(THROTTLE.maxPauseMs, 2 * pauseMs);
        const next = {
          ...paused(current, pausedUntil, now),
          haltedUntil: Math.max(current.haltedUntil, haltedUntil ?? 0),
          // A halt ends the row, so the first limit after it only pauses.
          limitedAt: haltedUntil === null ? now : null,
        };
        return [next, haltedUntil];
      });
    },

    /** Books a page load the extension did not start, such as the reload after a solved challenge. */
    async noteLoad(): Promise<void> {
      await book((current, now) => [
        { ...current, nextPageAt: Math.max(current.nextPageAt, gapAfter(now)) },
        null,
      ]);
    },
  };
}

export type Throttle = ReturnType<typeof createThrottle>;

export function parseRetryAfter(header: string | null, now: number): number | null {
  if (header === null) return null;
  const seconds = Number(header);
  if (header.trim() !== "" && Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}
