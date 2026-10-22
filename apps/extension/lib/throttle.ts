import * as z from "zod";
import type { Clock, SessionValue } from "./clock";
import { timeoutSignal, unlessAborted } from "./clock";
import { PAGE_TIMEOUT_MS } from "./collect";

export const THROTTLE = {
  minGapMs: 2500,
  jitterMs: 1000,
  defaultPauseMs: 15_000,
  /** A longer pause halts the queue instead of keeping the user waiting. */
  maxPauseMs: 5 * 60_000,
  /** How long a load may still run in its tab after it timed out, since the tab hears of it last. */
  graceMs: 5000,
} as const;

export const throttleStateSchema = z.strictObject({
  nextPageAt: z.number(),
  pausedUntil: z.number(),
});
export type ThrottleState = z.output<typeof throttleStateSchema>;

export const OPEN_THROTTLE: ThrottleState = { nextPageAt: 0, pausedUntil: 0 };

export class PauseTooLongError extends Error {
  readonly pausedUntil: number;

  constructor(pausedUntil: number) {
    super(`MFC asked for a pause until ${new Date(pausedUntil).toISOString()}`);
    this.name = "PauseTooLongError";
    this.pausedUntil = pausedUntil;
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
        if (current.pausedUntil - now > THROTTLE.maxPauseMs) {
          throw new PauseTooLongError(current.pausedUntil);
        }
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
     * Runs one MFC page load in its turn. `work` gets a signal that aborts once the load times out.
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
      ended.resolve(settle(running, finished));
      return unlessAborted(AbortSignal.any([signal, timeout]), running);
    },

    async pause(until: number): Promise<void> {
      await book((current) => [
        { ...current, pausedUntil: Math.max(current.pausedUntil, until) },
        null,
      ]);
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
