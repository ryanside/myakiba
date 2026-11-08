import { useCallback, useId, useState } from "react";
import { MaskInput } from "@/components/ui/mask-input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCurrencyFromMinorUnits, minorUnitsToMajorString } from "@myakiba/utils/currency";
import { Button } from "../ui/button";
import { useInlineEdit } from "@/hooks/use-inline-edit";
import { MONEY_INPUT_HINT, parseMoneyInputToMinorUnits } from "@/lib/money-input";
import type { Saving } from "@/data/client";
import { cn } from "@/lib/utils";
import { CELL_EDITOR_CLASS_NAME, CELL_TRIGGER_CLASS_NAME } from "./cell-trigger";
import { EmptyValue } from "./empty-value";

interface InlineCurrencyCellProps {
  /** What the cell holds, such as "Price", for its accessible name. */
  label: string;
  value: number;
  currency: string;
  onSubmit: (newValue: number) => Saving;
  locale: string;
  disabled?: boolean;
  zeroAsEmpty?: boolean;
}

function amountOf(draft: string): number | null {
  const amount = parseMoneyInputToMinorUnits(draft);
  return amount.isOk() ? amount.value : null;
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
  const [invalid, setInvalid] = useState(false);
  const hintId = useId();
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
    parse: (draft) => (draft === "" ? null : amountOf(draft)),
  });

  const handleInputRef = useCallback((node: HTMLInputElement | null) => {
    node?.focus();
  }, []);

  if (edit.draft !== null) {
    const draft = edit.draft;
    return (
      <Tooltip open={invalid}>
        <TooltipTrigger
          render={
            <MaskInput
              {...edit.editorHandlers}
              ref={handleInputRef}
              mask="currency"
              currency={currency}
              locale={locale}
              value={draft}
              invalid={invalid}
              aria-describedby={invalid ? hintId : undefined}
              onValueChange={(_, unmaskedValue) => {
                edit.setDraft(unmaskedValue);
                setInvalid(false);
              }}
              onKeyDown={async (event) => {
                // An amount that does not read keeps the cell open, with the hint, rather than saving nothing.
                if (event.key === "Enter" && draft !== "" && amountOf(draft) === null) {
                  setInvalid(true);
                  return;
                }
                await edit.editorHandlers.onKeyDown(event);
              }}
              aria-label={label}
              className={CELL_EDITOR_CLASS_NAME}
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
      onClick={() => {
        setInvalid(false);
        edit.handleOpen();
      }}
      className={cn(CELL_TRIGGER_CLASS_NAME, "h-8 justify-start text-foreground")}
      variant="ghost"
      disabled={disabled}
      aria-label={edit.triggerLabel}
    >
      {edit.shownText || <EmptyValue />}
    </Button>
  );
}
