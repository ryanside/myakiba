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
import { CELL_TRIGGER_CLASS_NAME } from "./cell-trigger";
import { useMemo } from "react";
import { usePendingValue } from "@/hooks/use-pending-value";

type ColoredOption = {
  readonly value: string;
  readonly label: string;
  readonly color: string;
};

interface SelectCellProps {
  /** What the cell holds, such as "Status", for the combobox's accessible name. */
  label: string;
  value: string;
  options: readonly string[];
  onSubmit: (value: string) => Promise<void>;
  disabled?: boolean;
  colorMap?: Readonly<Record<string, string>>;
}

// In a table row the select reads as plain text; its chrome appears on hover and focus.
export const quietSelectTrigger = `${CELL_TRIGGER_CLASS_NAME} border-transparent bg-transparent dark:bg-transparent hover:border-input dark:hover:bg-input/30 focus-visible:border-ring data-popup-open:border-input dark:data-popup-open:bg-input/30 [&>svg]:opacity-0 hover:[&>svg]:opacity-100 focus-visible:[&>svg]:opacity-100 data-popup-open:[&>svg]:opacity-100`;

export function SelectCell({
  label,
  value,
  options,
  onSubmit,
  disabled = false,
  colorMap,
}: SelectCellProps) {
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
          onValueChange={(item: ColoredOption | null) => {
            if (item) submit(item.value);
          }}
          disabled={disabled}
          items={coloredItems}
        >
          <SelectTrigger className={quietSelectTrigger} aria-label={label}>
            <SelectValue>
              {(item: ColoredOption) => (
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
        onValueChange={(val: string | null) => {
          if (val) submit(val);
        }}
        disabled={disabled}
      >
        <SelectTrigger className={quietSelectTrigger} aria-label={label}>
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
