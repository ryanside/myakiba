import { MaskInput } from "@/components/ui/mask-input";
import { useCallback, useState } from "react";
import {
  formatCurrencyFromMinorUnits,
  majorStringToMinorUnits,
  minorUnitsToMajorString,
} from "@myakiba/utils/currency";
import { tryCatch } from "@myakiba/utils/result";
import { Button } from "../ui/button";
interface InlineCurrencyCellProps {
  value: number;
  currency: string;
  onSubmit: (newValue: number) => Promise<void>;
  locale: string;
  disabled?: boolean;
}

export function InlineCurrencyCell({
  value,
  currency,
  onSubmit,
  locale,
  disabled,
}: InlineCurrencyCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [newValue, setNewValue] = useState<string | null>(null);
  const [pendingValue, setPendingValue] = useState<number | null>(null);
  const currentValue = minorUnitsToMajorString(value);
  const isPending = pendingValue !== null && pendingValue !== value;
  const displayValue = isPending ? pendingValue : value;

  const handleSubmit = useCallback(async () => {
    const submittedValue = newValue ?? currentValue;

    if (submittedValue === currentValue) {
      setNewValue(null);
      setIsEditing(false);
      return;
    }
    if (submittedValue === "") {
      setNewValue(null);
      setIsEditing(false);
      return;
    }

    const nextValue = majorStringToMinorUnits(submittedValue);
    setPendingValue(nextValue);
    setNewValue(null);
    setIsEditing(false);

    const { error } = await tryCatch(onSubmit(nextValue));
    if (error) {
      setPendingValue(null);
      return;
    }
  }, [currentValue, newValue, onSubmit]);

  const handleCancel = useCallback(() => {
    setNewValue(null);
    setIsEditing(false);
  }, []);

  const handleStartEditing = useCallback(() => {
    setNewValue(currentValue);
    setIsEditing(true);
  }, [currentValue]);

  const handleInputRef = useCallback((node: HTMLInputElement | null) => {
    node?.focus();
  }, []);

  if (isEditing) {
    return (
      <MaskInput
        ref={handleInputRef}
        mask="currency"
        currency={currency}
        locale={locale}
        value={newValue ?? currentValue}
        onValueChange={(_, unmaskedValue) => {
          setNewValue(unmaskedValue);
        }}
        onBlur={handleCancel}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            handleSubmit();
          } else if (e.key === "Escape") {
            handleCancel();
          }
        }}
        className="text-foreground pl-0"
      />
    );
  }

  return (
    <Button
      onClick={handleStartEditing}
      className="text-foreground pl-0"
      variant="ghost"
      disabled={disabled || isPending}
    >
      {formatCurrencyFromMinorUnits(displayValue, currency)}
    </Button>
  );
}
