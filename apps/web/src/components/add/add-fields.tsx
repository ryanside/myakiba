import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { Badge } from "@/components/reui/badge";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
import { ORDER_STATUS_COLORS } from "@/lib/orders";
import { cn } from "@/lib/utils";
import { ORDER_STATUSES } from "@myakiba/contracts/shared/constants";
import type { Currency, OrderStatus } from "@myakiba/contracts/shared/types";

export const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 50;

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
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <FieldError id={`${id}-error`} className="text-xs whitespace-normal">
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

/** Order Status, with the dot it has in the Order form. */
export function OrderStatusSelect({
  id,
  value,
  onChange,
}: {
  readonly id: string;
  readonly value: OrderStatus;
  readonly onChange: (value: OrderStatus) => void;
}) {
  const named = (status: OrderStatus) => (
    <span className="flex items-center gap-2">
      <span
        className={cn("size-1.5 shrink-0 rounded-full", ORDER_STATUS_COLORS[status])}
        aria-hidden="true"
      />
      {status}
    </span>
  );
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        if (next !== null) onChange(next);
      }}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue>{named(value)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {ORDER_STATUSES.map((status) => (
          <SelectItem key={status} value={status}>
            {named(status)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
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
      <DatePicker id={id} value={value} onChange={onChange} placeholder="Select date" />
    </LabeledField>
  );
}

/** Enter adds a trimmed, unique tag, up to 20. */
export function TagsField({
  id,
  label,
  tags,
  error,
  onChange,
}: {
  readonly id: string;
  readonly label: ReactNode;
  readonly tags: readonly string[];
  readonly error?: string | undefined;
  readonly onChange: (tags: string[]) => void;
}) {
  const [text, setText] = useState("");
  const input = useRef<HTMLInputElement>(null);
  return (
    <LabeledField id={id} label={label} error={error}>
      <div className="grid gap-2">
        {tags.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <li key={tag}>
                <Badge variant="outline" className="h-6 gap-0.5 pr-0.5 pl-1.5">
                  <span className="[overflow-wrap:anywhere] whitespace-normal">{tag}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Remove tag ${tag}`}
                    onClick={() => {
                      onChange(tags.filter((other) => other !== tag));
                      // The button is gone next render, and the input may only then be enabled.
                      requestAnimationFrame(() => input.current?.focus());
                    }}
                  >
                    <HugeiconsIcon icon={Cancel01Icon} aria-hidden="true" />
                  </Button>
                </Badge>
              </li>
            ))}
          </ul>
        ) : null}
        <Input
          ref={input}
          id={id}
          value={text}
          aria-invalid={error === undefined ? undefined : true}
          aria-describedby={error === undefined ? undefined : `${id}-error`}
          placeholder="Type a tag and press Enter"
          maxLength={MAX_TAG_LENGTH}
          disabled={tags.length >= MAX_TAGS}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            const tag = text.trim();
            if (tag === "") return;
            if (!tags.includes(tag)) onChange([...tags, tag]);
            setText("");
          }}
        />
      </div>
    </LabeledField>
  );
}
