import * as z from "zod";
import type { Clock, SessionValue } from "./clock";

export const THROTTLE = {
  minGapMs: 2500,
  jitterMs: 1000,
  defaultPauseMs: 15_000,
  /** A longer pause halts the queue instead of keeping the user waiting. */
  maxPauseMs: 5 * 60_000,
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
  return {
    /** Runs one MFC page load in its turn. The next turn starts a gap after this load settles. */
    async load<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
      const { nextPageAt, pausedUntil } = await state.load();
      if (pausedUntil - clock.now() > THROTTLE.maxPauseMs) throw new PauseTooLongError(pausedUntil);
      const wait = Math.max(nextPageAt, pausedUntil) - clock.now();
      if (wait > 0) await clock.sleep(wait, signal);
      signal.throwIfAborted();
      try {
        return await work();
      } finally {
        const jitter = Math.floor(random() * THROTTLE.jitterMs);
        await state.save({
          ...(await state.load()),
          nextPageAt: clock.now() + THROTTLE.minGapMs + jitter,
        });
      }
    },
    async pause(until: number): Promise<void> {
      const current = await state.load();
      await state.save({ ...current, pausedUntil: Math.max(current.pausedUntil, until) });
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
