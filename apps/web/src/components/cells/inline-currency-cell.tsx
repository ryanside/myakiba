import { useCallback } from "react";
import { MaskInput } from "@/components/ui/mask-input";
import {
  formatCurrencyFromMinorUnits,
  minorUnitsToMajorString,
  parseMoneyToMinorUnits,
} from "@myakiba/utils/currency";
import { Button } from "../ui/button";
import { useInlineEdit } from "@/hooks/use-inline-edit";
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
  const edit = useInlineEdit({
    label,
    value,
    onSubmit,
    disabled,
    format: (minorUnits) =>
      zeroAsEmpty && minorUnits === 0
        ? ""
        : formatCurrencyFromMinorUnits(minorUnits, currency, locale),
    toDraft: minorUnitsToMajorString,
    parse: (draft) => (draft === "" ? null : parseMoneyToMinorUnits(draft)),
  });

  const handleInputRef = useCallback((node: HTMLInputElement | null) => {
    node?.focus();
  }, []);

  if (edit.draft !== null) {
    return (
      <MaskInput
        {...edit.editorHandlers}
        ref={handleInputRef}
        mask="currency"
        currency={currency}
        locale={locale}
        value={edit.draft}
        onValueChange={(_, unmaskedValue) => {
          edit.setDraft(unmaskedValue);
        }}
        aria-label={label}
        className={CELL_EDITOR_CLASS_NAME}
      />
    );
  }

  return (
    <Button
      onClick={edit.handleOpen}
      className={cn(CELL_TRIGGER_CLASS_NAME, "h-8 justify-start text-foreground")}
      variant="ghost"
      disabled={disabled}
      aria-label={edit.triggerLabel}
    >
      {edit.shownText || <EmptyValue />}
    </Button>
  );
}
