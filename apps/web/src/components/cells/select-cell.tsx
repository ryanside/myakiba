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

type ColoredOption = {
  readonly value: string;
  readonly label: string;
  readonly color: string;
};

interface SelectCellProps {
  value: string;
  options: readonly string[];
  onSubmit: (value: string) => Promise<void>;
  disabled?: boolean;
  colorMap?: Readonly<Record<string, string>>;
}

export function SelectCell({
  value,
  options,
  onSubmit,
  disabled = false,
  colorMap,
}: SelectCellProps) {
  const coloredItems = useMemo(() => {
    if (!colorMap) return null;
    return options.map((option) => ({
      value: option,
      label: option,
      color: colorMap[option] ?? "bg-muted",
    }));
  }, [options, colorMap]);

  if (coloredItems) {
    const currentItem = coloredItems.find((item) => item.value === value);

    return (
      <Field>
        <Select
          value={currentItem}
          onValueChange={(item: ColoredOption | null) => {
            if (item) onSubmit(item.value);
          }}
          disabled={disabled}
          items={coloredItems}
        >
          <SelectTrigger>
            <SelectValue>
              {(item: ColoredOption) => (
                <span className="flex items-center gap-2">
                  <span className={cn("size-1.5 rounded-full", item?.color)} />
                  <span>{item?.label}</span>
                </span>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
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
        value={value}
        onValueChange={(val: string | null) => {
          if (val) onSubmit(val);
        }}
        disabled={disabled}
      >
        <SelectTrigger>
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
