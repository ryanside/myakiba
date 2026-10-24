import { useState, useCallback, useMemo, useSyncExternalStore } from "react";
import { functionalUpdate } from "@tanstack/react-table";
import { parseJson } from "@myakiba/utils/parse-json";
import { Result } from "better-result";
import * as z from "zod";

const storageChanges = new EventTarget();
// Keep shared preferences usable when storage is full or unavailable.
const unpersistedValues = new Map<string, string>();

function readStoredValue(key: string): string | null {
  const unpersistedValue = unpersistedValues.get(key);
  if (unpersistedValue !== undefined) return unpersistedValue;

  return Result.try(() => globalThis.localStorage.getItem(key)).unwrapOr(null);
}

// A caller without a schema trusts what it stored, as it always has.
const storedJson = z.unknown();

function parseStoredValue<T>(item: string | null, initialValue: T, schema?: z.ZodType<T>): T {
  if (item === null) return initialValue;

  return parseJson(schema ?? (storedJson as z.ZodType<T>), item).unwrapOr(initialValue);
}

function useLocalStorage<T>(
  key: string,
  initialValue: T,
  schema?: z.ZodType<T>,
): readonly [T, (value: T | ((prev: T) => T)) => void] {
  // oxlint-disable-next-line react/hook-use-state -- Capture the initial fallback once; storage subscriptions own subsequent changes (until 2027-04-16, approved by root, pending operator review)
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
      const persisted = Result.try(() => globalThis.localStorage.setItem(key, serialized));
      if (persisted.isOk()) unpersistedValues.delete(key);
      else unpersistedValues.set(key, serialized);
      storageChanges.dispatchEvent(new Event(key));
    },
    [key, defaultValue, schema],
  );

  return [storedValue, setValue] as const;
}

export { useLocalStorage };
