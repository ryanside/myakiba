import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { MaskInput } from "@/components/ui/mask-input";
import { useForm } from "@tanstack/react-form";
import { useMemo, useRef, useState } from "react";
import {
  formatCurrencyFromMinorUnits,
  majorStringToMinorUnits,
  minorUnitsToMajorString,
} from "@myakiba/utils/currency";
import { tryCatch } from "@myakiba/utils/result";
import { toast } from "sonner";

interface PopoverInput {
  readonly title: string;
  readonly type: "currency";
  readonly value: number;
  readonly name: string;
}

interface PopoverMultiInputCellProps {
  readonly inputs: readonly PopoverInput[];
  readonly totalAmount: number;
  readonly currency: string;
  readonly locale: string;
  readonly onSubmit: (newValues: Record<string, number>) => Promise<void>;
  readonly disabled?: boolean;
  readonly title?: string;
  readonly description?: string;
}

function sumValues(values: Iterable<number>): number {
  let sum = 0;
  for (const v of values) sum += v;
  return sum;
}

export function PopoverMultiInputCell({
  inputs,
  totalAmount,
  currency,
  locale,
  onSubmit,
  disabled = false,
  title = "Cost Breakdown",
  description,
}: PopoverMultiInputCellProps): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const [pending, setPending] = useState<Record<string, number> | null>(null);

  const inputsSum = useMemo(() => sumValues(inputs.map((input) => input.value)), [inputs]);

  const pendingMatchesInputs = useMemo<boolean>(() => {
    if (!pending) return false;
    if (Object.keys(pending).length !== inputs.length) return false;
    return inputs.every((input) => pending[input.name] === input.value);
  }, [pending, inputs]);

  const displayInputsSum =
    pending && !pendingMatchesInputs ? sumValues(Object.values(pending)) : inputsSum;
  const displayTotal = totalAmount - inputsSum + displayInputsSum;
  const formattedTotal = formatCurrencyFromMinorUnits(displayTotal, currency, locale);

  const handleSubmit = async (newValues: Record<string, number>): Promise<void> => {
    setPending(newValues);
    const { error } = await tryCatch(onSubmit(newValues));
    if (error) {
      setPending(null);
      toast.error(error.message);
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            className="w-full justify-start text-foreground pl-0"
            disabled={disabled}
          >
            {formattedTotal}
          </Button>
        }
      />
      {isOpen && (
        <PopoverMultiInputCellContent
          inputs={inputs}
          currency={currency}
          locale={locale}
          onSubmit={handleSubmit}
          title={title}
          description={description}
          close={() => setIsOpen(false)}
        />
      )}
    </Popover>
  );
}

function PopoverMultiInputCellContent({
  inputs,
  currency,
  locale,
  onSubmit,
  title,
  description,
  close,
}: {
  readonly inputs: readonly PopoverInput[];
  readonly currency: string;
  readonly locale: string;
  readonly onSubmit: (newValues: Record<string, number>) => Promise<void>;
  readonly title?: string;
  readonly description?: string;
  readonly close: () => void;
}) {
  const firstInputRef = useRef<HTMLInputElement>(null);
  const form = useForm({
    defaultValues: Object.fromEntries(
      inputs.map((input) => [input.name, minorUnitsToMajorString(input.value)]),
    ),
    onSubmit: async ({ value }) => {
      close();
      const converted = Object.fromEntries(
        Object.entries(value).map(([key, amount]) => [key, majorStringToMinorUnits(amount)]),
      );
      await onSubmit(converted);
    },
  });

  return (
    <PopoverContent className="w-72 p-0" align="start">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
      >
        <PopoverHeader className="px-3 pt-3 pb-2">
          <PopoverTitle className="text-xs">{title}</PopoverTitle>
          {description && <p className="text-[11px] text-muted-foreground">{description}</p>}
        </PopoverHeader>

        <div className="flex flex-col gap-2 px-3 pb-3">
          {inputs.map((input, index) => (
            <form.Field key={input.name} name={input.name}>
              {(field) => (
                <div className="grid grid-cols-[5.5rem_1fr] items-center gap-2">
                  <Label htmlFor={input.name} className="truncate text-xs text-muted-foreground">
                    {input.title}
                  </Label>
                  <MaskInput
                    ref={index === 0 ? firstInputRef : undefined}
                    id={input.name}
                    name={input.name}
                    mask={input.type}
                    currency={currency}
                    locale={locale}
                    value={field.state.value}
                    onValueChange={(_, unmasked) => field.handleChange(unmasked)}
                    className="h-7 text-xs"
                  />
                </div>
              )}
            </form.Field>
          ))}
        </div>

        <Separator />

        <div className="flex justify-end gap-1.5 px-3 py-2">
          <Button type="button" variant="ghost" size="xs" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" size="xs">
            Save
          </Button>
        </div>
      </form>
    </PopoverContent>
  );
}
