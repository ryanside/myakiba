import type { ReactNode } from "react";
import * as z from "zod";
import type { Currency } from "@myakiba/contracts/shared/types";
import { FieldError } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { MaskInput } from "@/components/ui/mask-input";
import { getCurrencyLocale } from "@/lib/locale";
import { moneyInput } from "@/lib/money-input";

type MoneyFieldApi = {
  readonly name: string;
  readonly state: {
    readonly value: string;
    readonly meta: {
      readonly isValid: boolean;
      readonly errors: readonly (string | { readonly message?: string } | null | undefined)[];
    };
  };
  readonly handleChange: (value: string) => void;
  readonly handleBlur: () => void;
};

/** A form whose field at `Name` holds the text of an amount. */
type MoneyForm<Name extends string> = {
  readonly Field: (props: {
    readonly name: Name;
    readonly validators: { readonly onChange: z.ZodType<string, string> };
    readonly children: (field: MoneyFieldApi) => ReactNode;
  }) => ReactNode | Promise<ReactNode>;
};

type MoneyFieldProps<Name extends string> = {
  readonly form: MoneyForm<Name>;
  readonly name: Name;
  readonly currency: Currency;
  readonly placeholder?: string;
  /** A labelled field also names its input, for a form that reads it by id. */
  readonly label?: string;
  readonly id?: string;
  /** The error for an empty amount. Without it, an empty amount reads as 0. */
  readonly required?: string;
};

/** One amount in a form: its mask, the strict `moneyInput` check, the invalid state and its error. */
export function MoneyField<Name extends string>({
  form,
  name,
  currency,
  placeholder,
  label,
  id,
  required,
}: MoneyFieldProps<Name>) {
  return (
    <form.Field
      name={name}
      validators={{
        onChange:
          required === undefined ? moneyInput : z.string().nonempty(required).pipe(moneyInput),
      }}
      children={(field) => {
        const input = (
          <MaskInput
            mask="currency"
            currency={currency}
            locale={getCurrencyLocale(currency)}
            placeholder={placeholder}
            invalid={!field.state.meta.isValid}
            value={field.state.value}
            onValueChange={(_maskedValue, unmaskedValue) => field.handleChange(unmaskedValue)}
            {...(label !== undefined && {
              id: id ?? field.name,
              name: field.name,
              onBlur: field.handleBlur,
            })}
          />
        );
        return label === undefined ? (
          <div className="grid gap-1">
            {input}
            <FieldError className="text-xs" errors={field.state.meta.errors} />
          </div>
        ) : (
          <div className="grid gap-1.5">
            <Label htmlFor={id ?? field.name}>{label}</Label>
            {input}
            <FieldError className="text-xs" errors={field.state.meta.errors} />
          </div>
        );
      }}
    />
  );
}
