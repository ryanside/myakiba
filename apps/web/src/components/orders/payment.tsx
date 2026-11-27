import type { ComponentProps } from "react";
import { ThemedBadge } from "@/components/reui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export function PaymentBadge({
  paid,
  size,
  className,
}: {
  readonly paid: boolean;
  readonly size?: ComponentProps<typeof ThemedBadge>["size"];
  readonly className?: string;
}) {
  return (
    <ThemedBadge
      variant={paid ? "success-light" : "warning-light"}
      size={size}
      className={className}
    >
      {paid ? "Paid" : "Unpaid"}
    </ThemedBadge>
  );
}

export function PaidCheckbox({
  paid,
  label,
  disabled,
  onPaidChange,
}: {
  readonly paid: boolean;
  readonly label: string;
  readonly disabled?: boolean;
  readonly onPaidChange: (paid: boolean) => void;
}) {
  return (
    <Checkbox
      aria-label={label}
      checked={paid}
      disabled={disabled}
      onCheckedChange={() => onPaidChange(!paid)}
    />
  );
}

export function PaidField({
  id,
  paid,
  onPaidChange,
}: {
  readonly id: string;
  readonly paid: boolean;
  readonly onPaidChange: (paid: boolean) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <span aria-hidden="true" className="invisible text-sm leading-none font-medium">
        Paid
      </span>
      <div className="flex h-8 items-center gap-2">
        <Checkbox id={id} checked={paid} onCheckedChange={(next) => onPaidChange(next === true)} />
        <Label htmlFor={id} className="cursor-pointer">
          Paid
        </Label>
      </div>
    </div>
  );
}
