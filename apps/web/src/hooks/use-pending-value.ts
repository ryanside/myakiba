import { useState } from "react";

function usePendingValue<T>(
  value: T,
  onSubmit: (newValue: T) => Promise<void> | void,
): readonly [T, (newValue: T) => Promise<void>] {
  const [pending, setPending] = useState<{ readonly value: T } | null>(null);

  const displayValue = pending !== null && !Object.is(pending.value, value) ? pending.value : value;

  const submit = async (newValue: T): Promise<void> => {
    if (Object.is(newValue, value)) return;
    setPending({ value: newValue });
    try {
      await onSubmit(newValue);
    } finally {
      setPending(null);
    }
  };

  return [displayValue, submit] as const;
}

export { usePendingValue };
