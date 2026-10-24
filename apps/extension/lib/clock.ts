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
  readonly load: () => Promise<T>;
  readonly save: (value: T) => Promise<void>;
};

export class TimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`MFC did not answer in ${timeoutMs} ms`);
    this.name = "TimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

/** Aborts with a TimeoutError once `ms` pass on `clock`, unless `cancelled` aborts first. */
export function timeoutSignal(clock: Clock, ms: number, cancelled: AbortSignal): AbortSignal {
  const controller = new AbortController();
  void (async () => {
    await clock.sleep(ms, cancelled);
    if (!cancelled.aborted) controller.abort(new TimeoutError(ms));
  })();
  return controller.signal;
}

/** Settles as `work` does, or rejects with `signal`'s reason once it aborts, even when `work` ignores it. */
export async function unlessAborted<T>(signal: AbortSignal, work: Promise<T>): Promise<T> {
  const aborted = Promise.withResolvers<never>();
  const abort = () => aborted.reject(signal.reason);
  if (signal.aborted) abort();
  else signal.addEventListener("abort", abort, { once: true });
  try {
    return await Promise.race([work, aborted.promise]);
  } finally {
    signal.removeEventListener("abort", abort);
  }
}
