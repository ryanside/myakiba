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

function notify(key: string) {
  storageChanges.dispatchEvent(new Event(key));
}

function writeStoredValue(key: string, serialized: string) {
  const persisted = Result.try(() => globalThis.localStorage.setItem(key, serialized));
  if (persisted.isOk()) unpersistedValues.delete(key);
  else unpersistedValues.set(key, serialized);
  notify(key);
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
      writeStoredValue(key, JSON.stringify(functionalUpdate(value, previous)));
    },
    [key, defaultValue, schema],
  );

  return [storedValue, setValue] as const;
}

/** Removes stored values so their readers fall back to defaults. Returns a function that restores them. */
function removeLocalStorage(keys: readonly string[]): () => void {
  const previous = keys.flatMap((key) => {
    const value = readStoredValue(key);
    return value === null ? [] : [[key, value] as const];
  });
  for (const key of keys) {
    unpersistedValues.delete(key);
    // Unavailable storage holds nothing to remove.
    Result.try(() => globalThis.localStorage.removeItem(key));
    notify(key);
  }
  return () => {
    for (const [key, value] of previous) writeStoredValue(key, value);
  };
}

/** Whether any of these keys holds a stored value. `keys` must keep its identity across renders. */
function useHasLocalStorage(keys: readonly string[]): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const onStorageChange = (event: StorageEvent) => {
        if (event.key === null || keys.includes(event.key)) onStoreChange();
      };
      for (const key of keys) storageChanges.addEventListener(key, onStoreChange);
      globalThis.addEventListener("storage", onStorageChange);
      return () => {
        for (const key of keys) storageChanges.removeEventListener(key, onStoreChange);
        globalThis.removeEventListener("storage", onStorageChange);
      };
    },
    [keys],
  );
  return useSyncExternalStore(
    subscribe,
    () => keys.some((key) => readStoredValue(key) !== null),
    () => false,
  );
}

/** Reads a stored value outside React, such as in a route loader. */
function readLocalStorage<T>(key: string, initialValue: T, schema?: z.ZodType<T>): T {
  return parseStoredValue(readStoredValue(key), initialValue, schema);
}

export { readLocalStorage, removeLocalStorage, useHasLocalStorage, useLocalStorage };
