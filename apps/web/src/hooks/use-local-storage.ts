import { useState, useCallback, useEffect } from "react";
import * as z from "zod";

function resolveStoredValue<T>(value: T | ((prev: T) => T), previous: T): T {
  const updaterSchema = z.function({
    input: [z.custom<T>()],
    output: z.custom<T>(),
  });
  const updater = updaterSchema.safeParse(value);
  return updater.success ? updater.data(previous) : (value as T);
}

function useLocalStorage<T>(
  key: string,
  initialValue: T,
  schema?: z.ZodType<T>,
): readonly [T, (value: T | ((prev: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = globalThis.localStorage.getItem(key);
      if (item === null) return initialValue;

      const parsedValue = JSON.parse(item);
      if (schema === undefined) return parsedValue as T;

      const validatedValue = schema.safeParse(parsedValue);
      return validatedValue.success ? validatedValue.data : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = useCallback((value: T | ((prev: T) => T)) => {
    setStoredValue((prev) => resolveStoredValue(value, prev));
  }, []);

  useEffect(() => {
    try {
      globalThis.localStorage.setItem(key, JSON.stringify(storedValue));
    } catch {
      /* storage full or unavailable */
    }
  }, [key, storedValue]);

  return [storedValue, setValue] as const;
}

export { useLocalStorage };
