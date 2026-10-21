import * as z from "zod";
import type { Clock, SessionValue } from "./clock";

export const THROTTLE = {
  minGapMs: 2500,
  jitterMs: 1000,
  defaultBackoffMs: 15_000,
  maxBackoffMs: 60_000,
} as const;

export const throttleStateSchema = z.strictObject({
  nextPageAt: z.number(),
  pausedUntil: z.number(),
});
export type ThrottleState = z.output<typeof throttleStateSchema>;

export const OPEN_THROTTLE: ThrottleState = { nextPageAt: 0, pausedUntil: 0 };

export function createThrottle(deps: {
  readonly clock: Clock;
  readonly random: () => number;
  readonly state: SessionValue<ThrottleState>;
}) {
  const { clock, random, state } = deps;
  return {
    async waitTurn(): Promise<void> {
      const { nextPageAt, pausedUntil } = await state.load();
      const wait = Math.max(nextPageAt, pausedUntil) - clock.now();
      if (wait > 0) await clock.sleep(wait);
    },
    async pageLoaded(): Promise<void> {
      const jitter = Math.floor(random() * THROTTLE.jitterMs);
      await state.save({
        ...(await state.load()),
        nextPageAt: clock.now() + THROTTLE.minGapMs + jitter,
      });
    },
    async backOff(retryAfterMs: number | null): Promise<number> {
      const pausedUntil =
        clock.now() + Math.min(retryAfterMs ?? THROTTLE.defaultBackoffMs, THROTTLE.maxBackoffMs);
      await state.save({ ...(await state.load()), pausedUntil });
      return pausedUntil;
    },
  };
}

export function parseRetryAfter(header: string | null, now: number): number | null {
  if (header === null) return null;
  const seconds = Number(header);
  if (header.trim() !== "" && Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}
