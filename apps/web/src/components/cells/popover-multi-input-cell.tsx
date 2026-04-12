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
import { useRef, useState } from "react";
import { majorStringToMinorUnits, minorUnitsToMajorString } from "@myakiba/utils/currency";
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
  readonly total: string;
  readonly currency: string;
  readonly locale: string;
  readonly onSubmit: (newValues: Record<string, number>) => Promise<void>;
  readonly disabled?: boolean;
  readonly title?: string;
  readonly description?: string;
}

export function PopoverMultiInputCell({
  inputs,
  total,
  currency,
  locale,
  onSubmit,
  disabled = false,
  title = "Cost Breakdown",
  description,
}: PopoverMultiInputCellProps): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            className="w-full justify-start text-foreground pl-0"
            disabled={disabled}
          >
            {total}
          </Button>
        }
      />
      {isOpen && (
        <PopoverMultiInputCellContent
          inputs={inputs}
          currency={currency}
          locale={locale}
          onSubmit={onSubmit}
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
}: Omit<PopoverMultiInputCellProps, "total" | "disabled"> & {
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
      const { error } = await tryCatch(onSubmit(converted));
      if (error) toast.error(error.message);
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
