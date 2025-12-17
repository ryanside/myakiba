import { MaskInput } from "@/components/ui/mask-input";
import { useCallback, useEffect, useState } from "react";
import { formatCurrency } from "@/lib/utils";
import { Button } from "../ui/button";
interface InlineCurrencyCellProps {
  value: string;
  currency: string;
  onSubmit: (newValue: string) => Promise<void>;
  locale: string;
  disabled?: boolean;
}
import { tryCatch } from "@/lib/utils";

export function InlineCurrencyCell({
  value,
  currency,
  onSubmit,
  locale,
  disabled,
}: InlineCurrencyCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [newValue, setNewValue] = useState(value);

  // temporary workaround to ensure no stale data when the prop changes 
  useEffect(() => {
    setNewValue(value);
  }, [value]);

  const handleSubmit = useCallback(async () => {
    if (newValue === value) {
      setIsEditing(false);
      return;
    }
    if (newValue === "") {
      setNewValue(value);
      setIsEditing(false);
      return;
    }
    const { error } = await tryCatch(onSubmit(newValue));
    if (error) {
      setNewValue(value);
    }
    setIsEditing(false);
  }, [newValue, value, onSubmit]);

  const handleCancel = () => {
    setNewValue(value);
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
      {formatCurrency(newValue, currency)}
    </Button>
  );
}
