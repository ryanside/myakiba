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
  /** How long a load may still run in its tab after it timed out, since the tab hears of it last. */
  graceMs: 5000,
  inRowMs: 10 * 60_000,
} as const;

export const throttleStateSchema = z.strictObject({
  nextPageAt: z.number(),
  pausedUntil: z.number(),
  haltedUntil: z.number(),
  limitedAt: z.number().nullable(),
});
export type ThrottleState = z.output<typeof throttleStateSchema>;

export const OPEN_THROTTLE: ThrottleState = {
  nextPageAt: 0,
  pausedUntil: 0,
  haltedUntil: 0,
  limitedAt: null,
};

/**
 * Keeps a throttle turn going until `at` at the latest. It is booked as well, so a worker that stops meanwhile leaves
 * the next load waiting.
 */
export type HoldTurn = (at: number) => Promise<void>;

export class HaltedError extends Error {
  readonly until: number;

  constructor(until: number) {
    super(`MFC halted the queue until ${new Date(until).toISOString()}`);
    this.name = "HaltedError";
    this.until = until;
  }
}

function pausedOrHalted(current: ThrottleState, until: number, now: number): ThrottleState {
  const haltedUntil = until - now > THROTTLE.maxPauseMs ? until : 0;
  return {
    ...current,
    pausedUntil: Math.max(current.pausedUntil, until),
    haltedUntil: Math.max(current.haltedUntil, haltedUntil),
  };
}

async function timedOutOnceSettled(settled: Promise<void>, timeoutMs: number): Promise<never> {
  await settled;
  throw new TimeoutError(timeoutMs);
}

async function answerOnceStopped<T>(
  running: Promise<T>,
  settled: Promise<void>,
  timeout: AbortSignal,
  timeoutMs: number,
): Promise<T> {
  try {
    return await Promise.race([running, timedOutOnceSettled(settled, timeoutMs)]);
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
  /** Settles once the last load this worker started has ended and is on the books. */
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

  async function reserve(signal: AbortSignal, timeoutMs: number): Promise<void> {
    for (;;) {
      signal.throwIfAborted();
      const wait = await book((current, now): [ThrottleState, number] => {
        if (now < current.haltedUntil) throw new HaltedError(current.haltedUntil);
        const untilFree = Math.max(current.nextPageAt, current.pausedUntil) - now;
        if (untilFree > 0) return [current, untilFree];
        // Booked to the latest this load can end, so a worker that stops mid-load leaves the next one waiting it out.
        return [{ ...current, nextPageAt: gapAfter(now + timeoutMs + THROTTLE.graceMs) }, 0];
      });
      if (wait <= 0) return;
      await clock.sleep(wait, signal);
    }
  }

  async function settle(
    running: Promise<unknown>,
    finished: AbortController,
    endsBy: () => number,
  ): Promise<void> {
    const stopped = (async () => {
      await Promise.allSettled([running]);
      return "stopped" as const;
    })();
    for (let left = endsBy() - clock.now(); left > 0; left = endsBy() - clock.now()) {
      const wake = new AbortController();
      const first = await Promise.race([stopped, clock.sleep(left, wake.signal)]);
      wake.abort();
      if (first === "stopped") break;
    }
    finished.abort();
    try {
      await book((current, now) => [{ ...current, nextPageAt: gapAfter(now) }, null]);
    } catch (error) {
      console.error("could not book the end of an MFC page load", error);
    }
  }

  return {
    /**
     * Runs one MFC load in its turn. `work` gets a signal that aborts `timeoutMs` after the turn begins.
     * The next turn starts a gap after this load ends, even when the caller stopped waiting first.
     * `holdUntil` keeps the turn going up to a later time, for a load `work` can no longer stop.
     */
    async load<T>(
      signal: AbortSignal,
      work: (timeout: AbortSignal, holdUntil: HoldTurn) => Promise<T>,
      timeoutMs = PAGE_TIMEOUT_MS,
    ): Promise<T> {
      const previous = lastLoad;
      const ended = Promise.withResolvers<unknown>();
      lastLoad = Promise.all([previous, ended.promise]);
      try {
        await unlessAborted(signal, previous);
        await reserve(signal, timeoutMs);
      } catch (error) {
        ended.resolve(null);
        throw error;
      }
      const finished = new AbortController();
      const timeout = timeoutSignal(clock, timeoutMs, finished.signal);
      let endsBy = clock.now() + timeoutMs + THROTTLE.graceMs;
      const holdUntil: HoldTurn = async (at) => {
        endsBy = Math.max(endsBy, at);
        await book((current) => [
          { ...current, nextPageAt: Math.max(current.nextPageAt, gapAfter(at)) },
          null,
        ]);
      };
      const running = signal.aborted ? Promise.reject(signal.reason) : work(timeout, holdUntil);
      const settled = settle(running, finished, () => endsBy);
      ended.resolve(settled);
      return unlessAborted(signal, answerOnceStopped(running, settled, timeout, timeoutMs));
    },

    async pauseOrHalt(until: number): Promise<void> {
      await book((current, now) => [pausedOrHalted(current, until, now), null]);
    },

    async rateLimited(pausedUntil: number): Promise<{ readonly haltedUntil: number | null }> {
      return book((current, now): [ThrottleState, { readonly haltedUntil: number | null }] => {
        const pauseMs = pausedUntil - now;
        const inRow = current.limitedAt !== null && now - current.limitedAt <= THROTTLE.inRowMs;
        let haltedUntil: number | null = null;
        if (pauseMs > THROTTLE.maxPauseMs) haltedUntil = pausedUntil;
        else if (inRow) haltedUntil = now + Math.max(THROTTLE.maxPauseMs, 2 * pauseMs);
        const haltEndsRow = haltedUntil !== null;
        const next = {
          ...pausedOrHalted(current, pausedUntil, now),
          haltedUntil: Math.max(current.haltedUntil, haltedUntil ?? 0),
          limitedAt: haltEndsRow ? null : now,
        };
        return [next, { haltedUntil }];
      });
    },

    async answered(): Promise<void> {
      await book((current) => [{ ...current, limitedAt: null }, null]);
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
