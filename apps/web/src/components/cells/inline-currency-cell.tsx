import { useCallback, useState } from "react";
import { MaskInput } from "@/components/ui/mask-input";
import {
  formatCurrencyFromMinorUnits,
  minorUnitsToMajorString,
  parseMoneyToMinorUnits,
} from "@myakiba/utils/currency";
import { Button } from "../ui/button";
import { usePendingValue } from "@/hooks/use-pending-value";
import { cn } from "@/lib/utils";
import { CELL_EDITOR_CLASS_NAME, CELL_TRIGGER_CLASS_NAME } from "./cell-trigger";
import { EmptyValue } from "./empty-value";

interface InlineCurrencyCellProps {
  /** What the cell holds, such as "Price", for its accessible name. */
  label: string;
  value: number;
  currency: string;
  onSubmit: (newValue: number) => Promise<void>;
  locale: string;
  disabled?: boolean;
  /** Shows a dash for zero, for columns where zero means the price is unknown. */
  zeroAsEmpty?: boolean;
}

export function InlineCurrencyCell({
  value,
  currency,
  onSubmit,
  locale,
  disabled,
  zeroAsEmpty = false,
  label,
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
    const nextValue = parseMoneyToMinorUnits(editingValue);
    if (nextValue === displayValue) return;
    await submit(nextValue);
  }, [displayValue, editingValue, submit]);

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
        aria-label={label}
        // Leaving the cell keeps what was typed, as the Shop cell does.
        onBlur={() => {
          if (!disabled) void handleSubmit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            handleSubmit();
          } else if (e.key === "Escape") {
            handleCancel();
          }
        }}
        className={CELL_EDITOR_CLASS_NAME}
      />
    );
  }

  return (
    <Button
      onClick={handleEdit}
      className={cn(CELL_TRIGGER_CLASS_NAME, "h-8 justify-start text-foreground")}
      variant="ghost"
      disabled={disabled}
      aria-label={`${zeroAsEmpty && displayValue === 0 ? "Empty" : formatCurrencyFromMinorUnits(displayValue, currency, locale)}, edit ${label}`}
    >
      {zeroAsEmpty && displayValue === 0 ? (
        <EmptyValue />
      ) : (
        formatCurrencyFromMinorUnits(displayValue, currency, locale)
      )}
    </Button>
  );
}
