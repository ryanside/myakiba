import { useCallback, useId, useState } from "react";
import { MaskInput } from "@/components/ui/mask-input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCurrencyFromMinorUnits, minorUnitsToMajorString } from "@myakiba/utils/currency";
import { Button } from "../ui/button";
import { MONEY_INPUT_HINT, parseMoneyInputToMinorUnits } from "@/lib/money-input";
import { usePendingValue } from "@/hooks/use-pending-value";
import type { Saving } from "@/data/client";
import { runSubmit } from "@/lib/form-submit";

interface InlineCurrencyCellProps {
  value: number;
  currency: string;
  onSubmit: (newValue: number) => Saving;
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
  const [invalid, setInvalid] = useState(false);
  const [displayValue, submit] = usePendingValue(value, onSubmit);
  const hintId = useId();

  const handleEdit = useCallback(() => {
    setEditingValue(minorUnitsToMajorString(displayValue));
    setInvalid(false);
    setIsEditing(true);
  }, [displayValue]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (editingValue === "") {
      setIsEditing(false);
      return;
    }
    const amount = parseMoneyInputToMinorUnits(editingValue);
    if (amount.isErr()) {
      setInvalid(true);
      return;
    }
    setIsEditing(false);
    await submit(amount.value);
  }, [editingValue, submit]);

  const handleInputRef = useCallback((node: HTMLInputElement | null) => {
    node?.focus();
  }, []);

  if (isEditing) {
    return (
      <Tooltip open={invalid}>
        <TooltipTrigger
          render={
            <MaskInput
              ref={handleInputRef}
              mask="currency"
              currency={currency}
              locale={locale}
              value={editingValue}
              invalid={invalid}
              aria-describedby={invalid ? hintId : undefined}
              onValueChange={(_, unmaskedValue) => {
                setEditingValue(unmaskedValue);
                setInvalid(false);
              }}
              onBlur={handleCancel}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  void runSubmit(handleSubmit);
                } else if (e.key === "Escape") {
                  handleCancel();
                }
              }}
              className="h-8 w-full text-foreground pl-0"
            />
          }
        />
        <TooltipContent id={hintId} side="bottom">
          {MONEY_INPUT_HINT}
        </TooltipContent>
      </Tooltip>
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
