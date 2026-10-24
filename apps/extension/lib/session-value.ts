import { Result } from "better-result";
import type * as z from "zod";
import type { SessionValue } from "./clock";
import { SessionStorageUnavailable } from "./errors/session-storage-unavailable";
import { SessionValueInvalid } from "./errors/session-value-invalid";

/** The part of `browser.storage.session` a session value uses. What it reads back is checked against the schema. */
export type SessionArea<T> = {
  readonly get: (key: string) => Promise<Partial<Record<string, T>>>;
  readonly set: (items: Record<string, T>) => Promise<void>;
};

function parsed<T>(
  key: string,
  schema: z.ZodType<T>,
  stored: T | undefined,
): Result<T, SessionValueInvalid> {
  const read = schema.safeParse(stored);
  return read.success
    ? Result.ok(read.data)
    : Result.err(new SessionValueInvalid({ key, issues: read.error.issues }));
}

export function sessionValue<T>(
  area: SessionArea<T>,
  key: string,
  schema: z.ZodType<T>,
  fallback: T,
): SessionValue<T> {
  return {
    async load() {
      const stored = await Result.tryPromise({
        try: () => area.get(key),
        catch: (cause) => new SessionStorageUnavailable({ key, op: "get", cause }),
      });
      // A value that no longer fits its schema, as after an update, starts over from the fallback.
      return stored.map((items) => parsed(key, schema, items[key]).unwrapOr(fallback));
    },
    save(value) {
      return Result.tryPromise({
        try: () => area.set({ [key]: value }),
        catch: (cause) => new SessionStorageUnavailable({ key, op: "set", cause }),
      });
    },
  };
}
