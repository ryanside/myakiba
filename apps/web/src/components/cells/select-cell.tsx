import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Field } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { useMemo } from "react";
import { usePendingValue } from "@/hooks/use-pending-value";
import type { Saving } from "@/data/client";

type ColoredOption<Value extends string> = {
  readonly value: Value;
  readonly label: string;
  readonly color: string;
};

interface SelectCellProps<Value extends string> {
  id?: string;
  value: Value;
  options: readonly Value[];
  onSubmit: (value: Value) => Saving;
  disabled?: boolean;
  colorMap?: Readonly<Record<string, string>>;
}

export function SelectCell<Value extends string>({
  id,
  value,
  options,
  onSubmit,
  disabled = false,
  colorMap,
}: SelectCellProps<Value>) {
  const [displayValue, submit] = usePendingValue(value, onSubmit);

  const coloredItems = useMemo(() => {
    if (!colorMap) return null;
    return options.map((option) => ({
      value: option,
      label: option,
      color: colorMap[option] ?? "bg-muted",
    }));
  }, [options, colorMap]);

  if (coloredItems) {
    const currentItem = coloredItems.find((item) => item.value === displayValue);

    return (
      <Field>
        <Select
          value={currentItem}
          onValueChange={(item: ColoredOption<Value> | null) => {
            if (item) submit(item.value);
          }}
          disabled={disabled}
          items={coloredItems}
        >
          <SelectTrigger id={id}>
            <SelectValue>
              {(item: ColoredOption<Value>) => (
                <span className="flex items-center gap-2">
                  <span className={cn("size-1.5 rounded-full", item?.color)} />
                  <span>{item?.label}</span>
                </span>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {coloredItems.map((item) => (
                <SelectItem key={item.value} value={item}>
                  <span className="flex items-center gap-2">
                    <span className={cn("size-1.5 rounded-full", item.color)} />
                    <span>{item.label}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
    );
  }

  return (
    <Field>
      <Select
        value={displayValue}
        onValueChange={(val: Value | null) => {
          if (val) submit(val);
        }}
        disabled={disabled}
      >
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}
