import { Result } from "better-result";
import { AttemptAbandoned } from "./errors/attempt-abandoned";
import { MfcLoadTimedOut } from "./errors/mfc-load-timed-out";
import type { SessionStorageUnavailable } from "./errors/session-storage-unavailable";

export type Clock = {
  readonly now: () => number;
  /** Resolves after `ms`, or as soon as `signal` aborts. */
  readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
};

export const systemClock: Clock = {
  now: () => Date.now(),
  sleep: (ms, signal) =>
    new Promise((resolve) => {
      if (signal?.aborted) {
        resolve();
        return;
      }
      const timer = setTimeout(resolve, ms);
      signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    }),
};

/** Survives a service-worker restart, which would otherwise reset the throttle. */
export type SessionValue<T> = {
  readonly load: () => Promise<Result<T, SessionStorageUnavailable>>;
  readonly save: (value: T) => Promise<Result<void, SessionStorageUnavailable>>;
};

/** Aborts with MfcLoadTimedOut once `ms` pass on `clock`, unless `cancelled` aborts first. */
export function timeoutSignal(clock: Clock, ms: number, cancelled: AbortSignal): AbortSignal {
  const controller = new AbortController();
  void (async () => {
    await clock.sleep(ms, cancelled);
    if (!cancelled.aborted) controller.abort(new MfcLoadTimedOut({ timeoutMs: ms }));
  })();
  return controller.signal;
}

/** Settles as `work` does, or answers AttemptAbandoned once `signal` aborts, even when `work` ignores it. */
export async function unlessAborted<T>(
  signal: AbortSignal,
  work: Promise<T>,
): Promise<Result<T, AttemptAbandoned>> {
  const aborted = Promise.withResolvers<Result<T, AttemptAbandoned>>();
  const abort = () => aborted.resolve(Result.err(new AttemptAbandoned()));
  if (signal.aborted) abort();
  else signal.addEventListener("abort", abort, { once: true });
  try {
    return await Promise.race([work.then((value) => Result.ok(value)), aborted.promise]);
  } finally {
    signal.removeEventListener("abort", abort);
  }
}
