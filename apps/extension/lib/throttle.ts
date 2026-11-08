import { Result } from "better-result";
import * as z from "zod";
import type { Clock } from "./clock";
import { timeoutSignal, unlessAborted } from "./clock";
import { PAGE_TIMEOUT_MS } from "./collect";
import { MfcLoadTimedOut } from "./errors/mfc-load-timed-out";
import { MfcQueueHalted } from "./errors/mfc-queue-halted";
import type { SessionStorageUnavailable } from "./errors/session-storage-unavailable";
import { remembered } from "./session-value";
import type { SessionValue } from "./session-value";

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
export type HoldTurn = (at: number) => Promise<void>;

/**
 * How a throttle turn fails, whatever its work does. A turn whose signal aborts stops at once with MfcLoadTimedOut, which
 * the attempt that aborted it never reads: it decides from its signal.
 */
export type TurnFailure = MfcLoadTimedOut | MfcQueueHalted;

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
  const { clock, random } = deps;
  const books = remembered(deps.state, OPEN_THROTTLE);
  /** Settles once the last load this worker started has ended and is on the books. */
  let lastLoad: Promise<unknown> = Promise.resolve();

  const gapAfter = (at: number) =>
    at + THROTTLE.minGapMs + Math.floor(random() * THROTTLE.jitterMs);

  async function book<R>(
    change: (current: ThrottleState, now: number) => readonly [ThrottleState, R],
  ): Promise<Result<R, SessionStorageUnavailable>> {
    await books.ready();
    const [next, result] = change(books.get(), clock.now());
    const saved = await books.set(next);
    return saved.map(() => result);
  }

  const write = (change: (current: ThrottleState, now: number) => ThrottleState) =>
    book((current, now) => [change(current, now), undefined] as const);

  /**
   * Books a change to the turns once the books are ready. The worker keeps it in memory, so a write storage refuses is
   * only logged: it delays nothing but a restarted worker.
   */
  async function bookTurn(
    change: (current: ThrottleState, now: number) => ThrottleState,
    what: string,
  ): Promise<void> {
    const written = await books.set(change(books.get(), clock.now()));
    written.tapError((failure) => {
      console.error(`could not book ${what}`, failure);
    });
  }

  async function reserve(
    signal: AbortSignal,
    timeoutMs: number,
  ): Promise<Result<void, TurnFailure>> {
    await books.ready();
    for (;;) {
      if (signal.aborted) return Result.err(new MfcLoadTimedOut({ timeoutMs }));
      const current = books.get();
      const now = clock.now();
      if (now < current.haltedUntil) {
        return Result.err(new MfcQueueHalted({ until: current.haltedUntil }));
      }
      const untilFree = Math.max(current.nextPageAt, current.pausedUntil) - now;
      if (untilFree <= 0) {
        // Booked to the latest this load can end, so a worker that stops mid-load leaves the next one waiting it out.
        await bookTurn(
          (latest, at) => ({ ...latest, nextPageAt: gapAfter(at + timeoutMs + THROTTLE.graceMs) }),
          "the start of an MFC page load",
        );
        return Result.ok();
      }
      await clock.sleep(untilFree, signal);
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
    await bookTurn(
      (current, now) => ({ ...current, nextPageAt: gapAfter(now) }),
      "the end of an MFC page load",
    );
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
        await unlessAborted(signal, previous);
        reserved = await reserve(signal, timeoutMs);
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
        return bookTurn(
          (current) => ({ ...current, nextPageAt: Math.max(current.nextPageAt, gapAfter(at)) }),
          "a load the extension can no longer stop",
        );
      };
      const stopped = new MfcLoadTimedOut({ timeoutMs });
      const running: Promise<Result<T, E | MfcLoadTimedOut>> = signal.aborted
        ? Promise.resolve(Result.err(stopped))
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
      return answer ?? Result.err(stopped);
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
        return [next, { haltedUntil }] as const;
      });
    },

    /** Books an answer that was not a rate limit, which ends a row of them. `what` names the answer for the log. */
    async answered(what: string): Promise<void> {
      await books.ready();
      await bookTurn((current) => ({ ...current, limitedAt: null }), what);
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
