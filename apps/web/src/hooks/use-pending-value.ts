import { useCallback, useState } from "react";

/**
 * Optimistically display the value being submitted while a mutation is in
 * flight, even when the underlying query data is not optimistically updated.
 *
 * The display value falls back to the prop `value` once it converges (mutation
 * succeeds and the query refetches) or once the pending state is cleared on
 * error.
 */
function usePendingValue<T>(
  value: T,
  onSubmit: (newValue: T) => Promise<void> | void,
): readonly [T, (newValue: T) => Promise<void>] {
  const [pending, setPending] = useState<{ readonly value: T } | null>(null);

  const displayValue = pending !== null && !Object.is(pending.value, value) ? pending.value : value;

  const submit = useCallback(
    async (newValue: T): Promise<void> => {
      if (Object.is(newValue, value)) return;
      setPending({ value: newValue });
      try {
        await onSubmit(newValue);
      } finally {
        setPending(null);
      }
    },
    [onSubmit, value],
  );

  return [displayValue, submit] as const;
}

export { usePendingValue };
