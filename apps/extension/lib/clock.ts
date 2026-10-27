import { MfcLoadTimedOut } from "./errors/mfc-load-timed-out";

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

/** Aborts with MfcLoadTimedOut once `ms` pass on `clock`, unless `cancelled` aborts first. */
export function timeoutSignal(clock: Clock, ms: number, cancelled: AbortSignal): AbortSignal {
  const controller = new AbortController();
  void (async () => {
    await clock.sleep(ms, cancelled);
    if (!cancelled.aborted) controller.abort(new MfcLoadTimedOut({ timeoutMs: ms }));
  })();
  return controller.signal;
}

/** Settles as `work` does, or answers null once `signal` aborts, even when `work` ignores it. */
export async function unlessAborted<T>(signal: AbortSignal, work: Promise<T>): Promise<T | null> {
  const aborted = Promise.withResolvers<null>();
  const abort = () => aborted.resolve(null);
  if (signal.aborted) abort();
  else signal.addEventListener("abort", abort, { once: true });
  try {
    return await Promise.race([work, aborted.promise]);
  } finally {
    signal.removeEventListener("abort", abort);
  }
}
