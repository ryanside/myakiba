import { Result, panic } from "better-result";
import * as z from "zod";
import { SessionStorageUnavailable } from "./errors/session-storage-unavailable";

/** A value in `browser.storage.session`, which survives a service-worker restart. Undefined means nothing usable is stored. */
export type SessionValue<T> = {
  readonly load: () => Promise<Result<T | undefined, SessionStorageUnavailable>>;
  readonly save: (value: T) => Promise<Result<void, SessionStorageUnavailable>>;
};

/** The part of `browser.storage.session` a session value uses. It reads back untyped items, which the schema checks. */
export type SessionArea<T> = {
  readonly get: (key: string) => Promise<object>;
  readonly set: (items: Record<string, T>) => Promise<void>;
};

export function sessionValue<T>(
  area: SessionArea<T>,
  key: string,
  schema: z.ZodType<T>,
): SessionValue<T> {
  const stored = z.object({ [key]: schema });
  return {
    async load() {
      const items = await Result.tryPromise({
        try: () => area.get(key),
        catch: (cause) => new SessionStorageUnavailable({ key, op: "get", cause }),
      });
      // A value that no longer fits its schema, as after an update, reads as nothing stored.
      return items.map((read) => stored.safeParse(read).data?.[key]);
    },
    save(value) {
      return Result.tryPromise({
        try: () => area.set({ [key]: value }),
        catch: (cause) => new SessionStorageUnavailable({ key, op: "set", cause }),
      });
    },
  };
}

/**
 * A session value read once per worker life and kept in memory, since only this worker writes it. Reads answer at once,
 * so a read and the change made from it cannot interleave with another change.
 */
type Remembered<T> = {
  /** Reads storage the first time it is called. Read nothing before it settles. */
  readonly ready: () => Promise<void>;
  readonly get: () => T;
  /** Keeps `value` at once, then writes it, so a write storage refuses only loses it for a restarted worker. */
  readonly set: (value: T) => Promise<Result<void, SessionStorageUnavailable>>;
};

/** Storage that will not read starts the value from `fallback`, as nothing stored does. */
export function remembered<T>(value: SessionValue<T>, fallback: T): Remembered<T> {
  let current: { readonly value: T } | null = null;
  let loading: Promise<void> | null = null;

  async function load(): Promise<void> {
    let read: Result<T | undefined, SessionStorageUnavailable>;
    try {
      read = await value.load();
    } catch (error) {
      panic("A session value threw while it read storage, instead of answering a Result.", error);
    }
    current ??= {
      value: read.match({
        ok: (stored) => stored ?? fallback,
        err: (failure) => {
          console.warn(`${failure._tag}: ${failure.message}`);
          return fallback;
        },
      }),
    };
  }

  return {
    /** A read that throws is a defect, and the next call reads again. */
    async ready() {
      loading ??= load();
      const reading = loading;
      try {
        await reading;
      } catch (error) {
        if (loading === reading) loading = null;
        throw error;
      }
    },
    get() {
      return (
        current ??
        panic("A session value was read before it was ready, so its stored value is unknown.")
      ).value;
    },
    async set(next) {
      current = { value: next };
      try {
        return await value.save(next);
      } catch (error) {
        panic(
          "A session value threw while it wrote storage, instead of answering a Result.",
          error,
        );
      }
    },
  };
}
