import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { MaskInput } from "../ui/mask-input";
import { useState } from "react";
import { tryCatch } from "@/lib/utils";
import { useForm } from "@tanstack/react-form";

interface PopoverInput {
  title: string;
  type: "currency";
  value: string;
  name: string; // Add a name field for form field identification
}

interface EditablePopoverCellProps {
  inputs: PopoverInput[];
  displayValue: string;
  currency: string;
  locale: string;
  onSubmit: (newValues: Record<string, string>) => Promise<void>;
}

export function EditablePopoverCell({
  inputs,
  displayValue,
  currency,
  locale,
  onSubmit,
}: EditablePopoverCellProps) {
  // Only create form when popover is opened
  const form = useForm({
    defaultValues: inputs.reduce(
      (acc, input) => ({
        ...acc,
        [input.name]: input.value,
      }),
      {} as Record<string, string>
    ),
    onSubmit: async ({ value }) => {
      const { error } = await tryCatch(onSubmit(value));
    },
  });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" className="text-foreground pl-0">
          {displayValue}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
        >
          <div className="grid gap-4">
            {inputs.map((input) => (
              <form.Field key={input.name} name={input.name}>
                {(field) => (
                  <div className="grid gap-2">
                    <Label htmlFor={input.name}>{input.title}</Label>
                    <MaskInput
                      id={input.name}
                      name={input.name}
                      mask="currency"
                      currency={currency}
                      locale={locale}
                      value={field.state.value}
                      onValueChange={(_, unmaskedValue) => {
                        field.handleChange(unmaskedValue);
                      }}
                    />
                  </div>
                )}
              </form.Field>
            ))}
            <div className="flex justify-end gap-2 mt-2">
              <Button type="button" variant="outline" size="sm">
                Cancel
              </Button>
              <Button type="submit" size="sm">
                Save
              </Button>
            </div>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
