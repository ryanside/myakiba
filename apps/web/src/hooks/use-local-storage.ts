import { useState, useCallback } from "react";

function useLocalStorage<T>(
  key: string,
  initialValue: T,
): readonly [T, (value: T | ((prev: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = globalThis.localStorage.getItem(key);
      return item !== null ? (JSON.parse(item) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      setStoredValue((prev) => {
        const nextValue = value instanceof Function ? value(prev) : value;
        try {
          globalThis.localStorage.setItem(key, JSON.stringify(nextValue));
        } catch {
          /* storage full or unavailable */
        }
        return nextValue;
      });
    },
    [key],
  );

  return [storedValue, setValue] as const;
}

export { useLocalStorage };
