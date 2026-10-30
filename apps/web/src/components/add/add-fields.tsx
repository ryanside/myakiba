import type { ReactNode } from "react";
import { DatePicker } from "@/components/ui/date-picker";
import { FieldError } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { MaskInput } from "@/components/ui/mask-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getCurrencyLocale } from "@/lib/locale";
import { cn } from "@/lib/utils";
import type { Currency } from "@myakiba/contracts/shared/types";

export function LabeledField({
  id,
  label,
  error,
  className,
  children,
}: {
  readonly id: string;
  readonly label: ReactNode;
  readonly error?: string | undefined;
  readonly className?: string | undefined;
  readonly children: ReactNode;
}) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
      {error ? (
        <FieldError id={`${id}-error`} className="text-xs">
          {error}
        </FieldError>
      ) : null}
    </div>
  );
}

export function EnumSelect<Value extends string>({
  id,
  value,
  options,
  onChange,
}: {
  readonly id: string;
  readonly value: Value;
  readonly options: readonly Value[];
  readonly onChange: (value: Value) => void;
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        if (next !== null) onChange(next);
      }}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** An amount held as the text the user typed, so blank stays different from zero. */
export function AmountInput({
  id,
  value,
  currency,
  placeholder,
  invalid,
  onChange,
}: {
  readonly id: string;
  readonly value: string;
  readonly currency: Currency;
  readonly placeholder: string;
  readonly invalid: boolean;
  readonly onChange: (value: string) => void;
}) {
  return (
    <MaskInput
      id={id}
      mask="currency"
      currency={currency}
      locale={getCurrencyLocale(currency)}
      placeholder={placeholder}
      invalid={invalid}
      aria-describedby={invalid ? `${id}-error` : undefined}
      inputMode="decimal"
      className="tabular-nums"
      value={value}
      onValueChange={(_masked, unmasked) => onChange(unmasked)}
    />
  );
}

export function DateField({
  id,
  label,
  value,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: string | null;
  readonly onChange: (value: string | null) => void;
}) {
  return (
    <LabeledField id={id} label={label}>
      <DatePicker id={id} value={value} onChange={onChange} placeholder="No date" />
    </LabeledField>
  );
}
