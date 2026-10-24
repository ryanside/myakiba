import type * as z from "zod";
import type { SessionValue } from "./clock";

/** The part of `browser.storage.session` a session value uses. What it reads back is checked against the schema. */
export type SessionArea<T> = {
  readonly get: (key: string) => Promise<Partial<Record<string, T>>>;
  readonly set: (items: Record<string, T>) => Promise<void>;
};

export function sessionValue<T>(
  area: SessionArea<T>,
  key: string,
  schema: z.ZodType<T>,
  fallback: T,
): SessionValue<T> {
  return {
    async load() {
      const stored = await area.get(key);
      const parsed = schema.safeParse(stored[key]);
      return parsed.success ? parsed.data : fallback;
    },
    async save(value) {
      await area.set({ [key]: value });
    },
  };
}
