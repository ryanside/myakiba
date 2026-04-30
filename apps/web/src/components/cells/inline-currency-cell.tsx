import { useCallback, useState } from "react";
import { MaskInput } from "@/components/ui/mask-input";
import {
  formatCurrencyFromMinorUnits,
  majorStringToMinorUnits,
  minorUnitsToMajorString,
} from "@myakiba/utils/currency";
import { Button } from "../ui/button";
import { usePendingValue } from "@/hooks/use-pending-value";

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
  const [editingValue, setEditingValue] = useState("");
  const [displayValue, submit] = usePendingValue(value, onSubmit);

  const handleEdit = useCallback(() => {
    setEditingValue(minorUnitsToMajorString(displayValue));
    setIsEditing(true);
  }, [displayValue]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
  }, []);

  const handleSubmit = useCallback(async () => {
    setIsEditing(false);
    if (editingValue === "") return;
    const nextValue = majorStringToMinorUnits(editingValue);
    await submit(nextValue);
  }, [editingValue, submit]);

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
        value={editingValue}
        onValueChange={(_, unmaskedValue) => {
          setEditingValue(unmaskedValue);
        }}
        onBlur={handleCancel}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            handleSubmit();
          } else if (e.key === "Escape") {
            handleCancel();
          }
        }}
        className="h-8 w-full text-foreground pl-0"
      />
    );
  }

  return (
    <Button
      onClick={handleEdit}
      className="w-full justify-start text-foreground pl-0"
      variant="ghost"
      disabled={disabled}
    >
      {formatCurrencyFromMinorUnits(displayValue, currency, locale)}
    </Button>
  );
}
