import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MaskInput } from "@/components/ui/mask-input";
import { useForm } from "@tanstack/react-form";
import * as Portal from "@radix-ui/react-portal";
import { useState } from "react";
import { majorStringToMinorUnits, minorUnitsToMajorString, tryCatch } from "@myakiba/utils";
import { toast } from "sonner";

interface PopoverInput {
  title: string;
  type: "currency";
  value: number;
  name: string;
}

interface PopoverMultiInputCellProps {
  inputs: PopoverInput[];
  total: string;
  currency: string;
  locale: string;
  onSubmit: (newValues: Record<string, number>) => Promise<void>;
}

export function PopoverMultiInputCell({
  inputs,
  total,
  currency,
  locale,
  onSubmit,
}: PopoverMultiInputCellProps) {
  const [isOpen, setIsOpen] = useState(false);

  const form = useForm({
    defaultValues: inputs.reduce(
      (acc, input) => ({
        ...acc,
        [input.name]: minorUnitsToMajorString(input.value),
      }),
      {} as Record<string, string>,
    ),
    onSubmit: async ({ value }) => {
      const transformedValues = Object.fromEntries(
        Object.entries(value).map(([key, amount]) => [key, majorStringToMinorUnits(amount)]),
      ) as Record<string, number>;
      const { error } = await tryCatch(onSubmit(transformedValues));
      if (error) {
        toast.error(error.message);
      }
    },
  });

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" className="text-foreground pl-0">
          {total}
        </Button>
      </PopoverTrigger>
      {isOpen && (
        <Portal.Root>
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
                          mask={input.type}
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
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" size="sm">
                    Save
                  </Button>
                </div>
              </div>
            </form>
          </PopoverContent>
        </Portal.Root>
      )}
    </Popover>
  );
}
