import { MaskInput } from "@/components/ui/mask-input";
import { useCallback, useState } from "react";
import { formatCurrency } from "@/lib/utils";
import { Button } from "../ui/button";
interface EditablePriceCellProps {
  oldValue: string;
  currency: string;
  onSubmit: (newValue: string) => Promise<void>;
  locale: string;
  disabled?: boolean;
}
import { tryCatch } from "@/lib/utils";

export function EditablePriceCell({
  oldValue,
  currency,
  onSubmit,
  locale,
  disabled,
}: EditablePriceCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [newValue, setNewValue] = useState(oldValue);

  const handleSubmit = useCallback(async () => {
    if (newValue === oldValue) {
      setIsEditing(false);
      return;
    }
    const { error } = await tryCatch(onSubmit(newValue));
    if (error) {
      setNewValue(oldValue);
    }
    setIsEditing(false);
  }, [newValue, oldValue, onSubmit]);

  const handleCancel = () => {
    setNewValue(oldValue);
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
      {formatCurrency(oldValue, currency)}
    </Button>
  );
}
