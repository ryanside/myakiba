import type { ReactNode } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

/** A select column's checkbox. `stopRowClick` is for a grid whose rows answer a click. */
export function SelectionCheckbox({
  label,
  checked,
  indeterminate,
  disabled,
  stopRowClick = false,
  onCheckedChange,
}: {
  readonly label: string;
  readonly checked: boolean;
  readonly indeterminate?: boolean;
  readonly disabled?: boolean;
  readonly stopRowClick?: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <Checkbox
      aria-label={label}
      checked={checked}
      indeterminate={indeterminate}
      disabled={disabled}
      onCheckedChange={(next) => onCheckedChange(next === true)}
      onClick={stopRowClick ? (event) => event.stopPropagation() : undefined}
      className="align-[inherit] mb-0.5 rounded-xs"
    />
  );
}

/** A body row's select cell: the 2px marker of a selected row, and what it holds. */
export function SelectionCell({
  selected,
  children,
}: {
  readonly selected: boolean;
  readonly children: ReactNode;
}) {
  return (
    <>
      <div
        className={cn(
          "hidden absolute top-0 bottom-0 start-0 w-[2px] bg-primary",
          selected && "block",
        )}
      />
      {children}
    </>
  );
}
