import { MaskInput } from "@/components/ui/mask-input";
import { useCallback, useEffect, useState } from "react";
import {
  formatCurrencyFromMinorUnits,
  majorStringToMinorUnits,
  minorUnitsToMajorString,
  tryCatch,
} from "@myakiba/utils";
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
  const [newValue, setNewValue] = useState<string>(minorUnitsToMajorString(value));
  const currentValue = minorUnitsToMajorString(value);

  // temporary workaround to ensure no stale data when the prop changes
  useEffect(() => {
    setNewValue(currentValue);
  }, [value]);

  const handleSubmit = useCallback(async () => {
    if (newValue === currentValue) {
      setIsEditing(false);
      return;
    }
    if (newValue === "") {
      setNewValue(currentValue);
      setIsEditing(false);
      return;
    }
    const { error } = await tryCatch(onSubmit(majorStringToMinorUnits(newValue)));
    if (error) {
      setNewValue(currentValue);
    }
    setIsEditing(false);
  }, [newValue, currentValue, onSubmit]);

  const handleCancel = () => {
    setNewValue(currentValue);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <MaskInput
        mask="currency"
        currency={currency}
        locale={locale}
        value={newValue}
        onValueChange={(_, unmaskedValue) => {
          setNewValue(unmaskedValue);
        }}
        onBlur={handleCancel}
        autoFocus
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
      onClick={() => setIsEditing(true)}
      className="text-foreground pl-0"
      variant="ghost"
      disabled={disabled}
    >
      {formatCurrencyFromMinorUnits(value, currency)}
    </Button>
  );
}
