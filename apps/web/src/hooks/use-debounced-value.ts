import { useEffect, useState } from "react";

/** The value after it stops changing for `delayMs`. An empty string passes through at once. */
export function useDebouncedValue(value: string, delayMs: number): string {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(
      () => {
        setDebouncedValue(value);
      },
      value.length === 0 ? 0 : delayMs,
    );

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [delayMs, value]);

  return debouncedValue;
}
