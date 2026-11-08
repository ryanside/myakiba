import { parseJson } from "@myakiba/utils/parse-json";
import * as z from "zod";

const PREFIX = "myakiba:account:";

/**
 * A `sessionStorage` value that belongs to the account that wrote it. Another account reads
 * nothing, and its read removes the value.
 */
export function accountSlot<Value>(name: string, schema: z.ZodType<Value>) {
  const key = `${PREFIX}${name}`;
  const stored = z.object({ userId: z.string(), value: schema });
  return {
    read(userId: string): Value | null {
      const text = sessionStorage.getItem(key);
      if (text === null) return null;
      const parsed = parseJson(stored, text);
      if (parsed.isOk() && parsed.value.userId === userId) return parsed.value.value;
      sessionStorage.removeItem(key);
      return null;
    },
    write(userId: string, value: Value) {
      sessionStorage.setItem(key, JSON.stringify({ userId, value }));
    },
    clear() {
      sessionStorage.removeItem(key);
    },
  };
}

/** Removes every account's values from this tab, for when the signed-in account goes away. */
export function forgetAccountStorage() {
  const keys = Array.from({ length: sessionStorage.length }, (_, index) =>
    sessionStorage.key(index),
  );
  for (const key of keys) if (key?.startsWith(PREFIX)) sessionStorage.removeItem(key);
}
