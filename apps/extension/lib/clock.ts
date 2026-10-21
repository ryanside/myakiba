export type Clock = {
  readonly now: () => number;
  /** Resolves after `ms`, or as soon as `signal` aborts. */
  readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
};

export const systemClock: Clock = {
  now: () => Date.now(),
  sleep: (ms, signal) =>
    new Promise((resolve) => {
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
