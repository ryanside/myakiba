import { useState, useCallback, useMemo, useSyncExternalStore } from "react";
import { functionalUpdate } from "@tanstack/react-table";
import type * as z from "zod";

const storageChanges = new EventTarget();
// Keep shared preferences usable when storage is full or unavailable.
const unpersistedValues = new Map<string, string>();

function readStoredValue(key: string): string | null {
  const unpersistedValue = unpersistedValues.get(key);
  if (unpersistedValue !== undefined) return unpersistedValue;

  try {
    return globalThis.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function parseStoredValue<T>(item: string | null, initialValue: T, schema?: z.ZodType<T>): T {
  if (item === null) return initialValue;

  try {
    const parsedValue = JSON.parse(item);
    if (schema === undefined) return parsedValue as T;

    const validatedValue = schema.safeParse(parsedValue);
    return validatedValue.success ? validatedValue.data : initialValue;
  } catch {
    return initialValue;
  }
}

function useLocalStorage<T>(
  key: string,
  initialValue: T,
  schema?: z.ZodType<T>,
): readonly [T, (value: T | ((prev: T) => T)) => void] {
  // oxlint-disable-next-line react/hook-use-state -- Capture the initial fallback once; storage subscriptions own subsequent changes.
  const [defaultValue] = useState(() => initialValue);
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const onStorageChange = (event: StorageEvent) => {
        if (event.key !== null && event.key !== key) return;
        unpersistedValues.delete(key);
        onStoreChange();
      };

      storageChanges.addEventListener(key, onStoreChange);
      globalThis.addEventListener("storage", onStorageChange);
      return () => {
        storageChanges.removeEventListener(key, onStoreChange);
        globalThis.removeEventListener("storage", onStorageChange);
      };
    },
    [key],
  );
  const getSnapshot = useCallback(() => readStoredValue(key), [key]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const storedValue = useMemo(
    () => parseStoredValue(snapshot, defaultValue, schema),
    [snapshot, defaultValue, schema],
  );
  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      const previous = parseStoredValue(readStoredValue(key), defaultValue, schema);
      const serialized = JSON.stringify(functionalUpdate(value, previous));
      try {
        globalThis.localStorage.setItem(key, serialized);
        unpersistedValues.delete(key);
      } catch {
        unpersistedValues.set(key, serialized);
      }
      storageChanges.dispatchEvent(new Event(key));
    },
    [key, defaultValue, schema],
  );

  return [storedValue, setValue] as const;
}

export { useLocalStorage };
