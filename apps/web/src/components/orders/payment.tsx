import type { ComponentProps } from "react";
import type { DateFormat, OrderPayment } from "@myakiba/contracts/shared/types";
import { ThemedBadge } from "@/components/reui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { formatDateOnlyForDisplay } from "@/lib/date-display";
import { ORDER_PAYMENT_DISPLAY } from "@/lib/orders";

export function PaymentBadge({
  payment,
  size,
  className,
}: {
  readonly payment: OrderPayment;
  readonly size?: ComponentProps<typeof ThemedBadge>["size"];
  readonly className?: string;
}) {
  const { label, variant } = ORDER_PAYMENT_DISPLAY[payment];
  return (
    <ThemedBadge variant={variant} size={size} className={className}>
      {label}
    </ThemedBadge>
  );
}

export function PaidCheckbox({
  payment,
  label,
  disabled,
  onPaidChange,
}: {
  readonly payment: OrderPayment;
  readonly label: string;
  readonly disabled?: boolean;
  readonly onPaidChange: (paid: boolean) => void;
}) {
  return (
    <Checkbox
      aria-label={label}
      checked={payment === "paid"}
      indeterminate={payment === "partly"}
      disabled={disabled}
      onCheckedChange={() => onPaidChange(payment !== "paid")}
    />
  );
}

export function PaymentLine({
  payment,
  paymentDate,
  dateFormat,
}: {
  readonly payment: OrderPayment;
  readonly paymentDate: string | null;
  readonly dateFormat: DateFormat;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">Payment</span>
      <PaymentBadge payment={payment} />
      {paymentDate ? (
        <span className="tabular-nums">{formatDateOnlyForDisplay(paymentDate, dateFormat)}</span>
      ) : null}
    </div>
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
