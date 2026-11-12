import { useState } from "react";
import type { Saving } from "@/data/client";

function usePendingValue<T>(
  value: T,
  onSubmit: (newValue: T) => Saving,
): readonly [T, (newValue: T) => Promise<void>] {
  const [pending, setPending] = useState<{ readonly value: T } | null>(null);

  const displayValue = pending !== null && !Object.is(pending.value, value) ? pending.value : value;

  const submit = async (newValue: T): Promise<void> => {
    if (Object.is(newValue, value)) return;
    setPending({ value: newValue });
    // A failed edit already showed its toast and rolled back, so the cell only drops its draft.
    await onSubmit(newValue);
    setPending(null);
  };

  return [displayValue, submit] as const;
}

export { usePendingValue };
