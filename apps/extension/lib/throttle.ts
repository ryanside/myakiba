import { Result } from "better-result";
import * as z from "zod";
import type { Clock, SessionValue } from "./clock";
import { timeoutSignal, unlessAborted } from "./clock";
import { PAGE_TIMEOUT_MS } from "./collect";
import { AttemptAbandoned } from "./errors/attempt-abandoned";
import { MfcLoadTimedOut } from "./errors/mfc-load-timed-out";
import { MfcQueueHalted } from "./errors/mfc-queue-halted";
import type { SessionStorageUnavailable } from "./errors/session-storage-unavailable";

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
 * Keeps a throttle turn going until `at` at the latest, for a load its work can no longer stop. It is booked as well, so
 * a worker that stops meanwhile leaves the next load waiting.
 */
export type HoldTurn = (at: number) => Promise<Result<void, SessionStorageUnavailable>>;

/** How a throttle turn fails, whatever its work does. */
export type TurnFailure =
  | MfcLoadTimedOut
  | MfcQueueHalted
  | AttemptAbandoned
  | SessionStorageUnavailable;

function pausedOrHalted(current: ThrottleState, until: number, now: number): ThrottleState {
  const haltedUntil = until - now > THROTTLE.maxPauseMs ? until : 0;
  return {
    ...current,
    pausedUntil: Math.max(current.pausedUntil, until),
    haltedUntil: Math.max(current.haltedUntil, haltedUntil),
  };
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

  /**
   * Reads and writes the books one change at a time, so no change overwrites another. A change that fails writes
   * nothing.
   */
  async function book<R, E = never>(
    change: (current: ThrottleState, now: number) => Result<[ThrottleState, R], E>,
  ): Promise<Result<R, E | SessionStorageUnavailable>> {
    const previous = books;
    const turn = Promise.withResolvers<null>();
    books = turn.promise;
    try {
      await previous;
      return await Result.gen(async function* () {
        const current = yield* Result.await(state.load());
        const [next, result] = yield* change(current, clock.now());
        yield* Result.await(state.save(next));
        return Result.ok(result);
      });
    } finally {
      turn.resolve(null);
    }
  }

  const write = (change: (current: ThrottleState, now: number) => ThrottleState) =>
    book((current, now) =>
      Result.ok<[ThrottleState, undefined]>([change(current, now), undefined]),
    );

  async function reserve(
    signal: AbortSignal,
    timeoutMs: number,
  ): Promise<Result<void, TurnFailure>> {
    for (;;) {
      if (signal.aborted) return Result.err(new AttemptAbandoned());
      const booked = await book((current, now): Result<[ThrottleState, number], MfcQueueHalted> => {
        if (now < current.haltedUntil) {
          return Result.err(new MfcQueueHalted({ until: current.haltedUntil }));
        }
        const untilFree = Math.max(current.nextPageAt, current.pausedUntil) - now;
        if (untilFree > 0) return Result.ok([current, untilFree]);
        // Booked to the latest this load can end, so a worker that stops mid-load leaves the next one waiting it out.
        return Result.ok([
          { ...current, nextPageAt: gapAfter(now + timeoutMs + THROTTLE.graceMs) },
          0,
        ]);
      });
      if (booked.isErr()) return Result.err(booked.error);
      if (booked.value <= 0) return Result.ok();
      await clock.sleep(booked.value, signal);
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
    const booked = await write((current, now) => ({ ...current, nextPageAt: gapAfter(now) }));
    booked.tapError((failure) => {
      console.error("could not book the end of an MFC page load", failure);
    });
  }

  /**
   * The work's answer, or MfcLoadTimedOut once the load has ended or run out its grace after the timeout. An error
   * the work answers after the timeout stopped it is that timeout.
   */
  async function answerOnceStopped<T, E>(
    running: Promise<Result<T, E>>,
    settled: Promise<void>,
    timeout: AbortSignal,
    timeoutMs: number,
  ): Promise<Result<T, E | MfcLoadTimedOut>> {
    const timedOut = new MfcLoadTimedOut({ timeoutMs });
    const answer = await Promise.race([running, settled.then(() => Result.err(timedOut))]);
    return answer.isErr() && timeout.aborted ? Result.err(timedOut) : answer;
  }

  return {
    /**
     * Runs one MFC load in its turn. `work` gets a signal that aborts `timeoutMs` after the turn begins.
     * The next turn starts a gap after this load ends, even when the caller stopped waiting first.
     */
    async load<T, E>(
      signal: AbortSignal,
      work: (timeout: AbortSignal, holdUntil: HoldTurn) => Promise<Result<T, E>>,
      timeoutMs = PAGE_TIMEOUT_MS,
    ): Promise<Result<T, E | TurnFailure>> {
      const previous = lastLoad;
      const ended = Promise.withResolvers<unknown>();
      lastLoad = Promise.all([previous, ended.promise]);
      let reserved: Result<void, TurnFailure>;
      try {
        const waited = await unlessAborted(signal, previous);
        reserved = waited.isOk() ? await reserve(signal, timeoutMs) : waited;
      } catch (error) {
        // A defect while reserving still frees the turn, so it cannot leave every later load waiting.
        ended.resolve(null);
        throw error;
      }
      if (reserved.isErr()) {
        ended.resolve(null);
        return Result.err(reserved.error);
      }
      const finished = new AbortController();
      const timeout = timeoutSignal(clock, timeoutMs, finished.signal);
      let endsBy = clock.now() + timeoutMs + THROTTLE.graceMs;
      const holdUntil: HoldTurn = (at) => {
        endsBy = Math.max(endsBy, at);
        return write((current) => ({
          ...current,
          nextPageAt: Math.max(current.nextPageAt, gapAfter(at)),
        }));
      };
      const running: Promise<Result<T, E | AttemptAbandoned>> = signal.aborted
        ? Promise.resolve(Result.err(new AttemptAbandoned()))
        : work(timeout, holdUntil);
      // The next turn waits for this load to end, not for its end to be booked. A defect at the end is reported here,
      // once, so it fails no later load and is never left unhandled.
      const settled = (async () => {
        try {
          await settle(running, finished, () => endsBy);
        } catch (error) {
          console.error("a defect stopped the end of an MFC page load", error);
        }
      })();
      ended.resolve(settled);
      const answer = await unlessAborted(
        signal,
        answerOnceStopped(running, settled, timeout, timeoutMs),
      );
      return Result.flatten(answer);
    },

    pauseOrHalt(until: number): Promise<Result<void, SessionStorageUnavailable>> {
      return write((current, now) => pausedOrHalted(current, until, now));
    },

    rateLimited(
      pausedUntil: number,
    ): Promise<Result<{ readonly haltedUntil: number | null }, SessionStorageUnavailable>> {
      return book((current, now) => {
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
        return Result.ok<[ThrottleState, { readonly haltedUntil: number | null }]>([
          next,
          { haltedUntil },
        ]);
      });
    },

    answered(): Promise<Result<void, SessionStorageUnavailable>> {
      return write((current) => ({ ...current, limitedAt: null }));
    },

    /** Books a page load the extension did not start, such as the reload after a solved challenge. */
    noteLoad(): Promise<Result<void, SessionStorageUnavailable>> {
      return write((current, now) => ({
        ...current,
        nextPageAt: Math.max(current.nextPageAt, gapAfter(now)),
      }));
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
