import type { ReactNode } from "react";
import type { DateFormat } from "@myakiba/contracts/shared/types";
import { formatDateOnlyForDisplay } from "@/lib/date-display";
import { cn } from "@/lib/utils";

type EnteredDateFields = {
  readonly orderDate: string | null;
  readonly paymentDate: string | null;
  readonly shippingDate: string | null;
  readonly collectionDate: string | null;
};

const DATE_LABELS = [
  ["orderDate", "Order Date"],
  ["paymentDate", "Payment Date"],
  ["shippingDate", "Shipping Date"],
  ["collectionDate", "Collection Date"],
] as const satisfies readonly (readonly [keyof EnteredDateFields, string])[];

export function EnteredDates({
  dates,
  dateFormat,
  className,
}: {
  readonly dates: EnteredDateFields;
  readonly dateFormat: DateFormat;
  readonly className?: string;
}): ReactNode {
  const entered = DATE_LABELS.flatMap(([field, label]) => {
    const date = dates[field];
    return date ? [{ label, date }] : [];
  });
  if (entered.length === 0) return null;

  return (
    <dl className={cn("flex flex-wrap gap-x-8 gap-y-3 text-sm", className)}>
      {entered.map(({ label, date }) => (
        <div key={label} className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="tabular-nums">{formatDateOnlyForDisplay(date, dateFormat)}</dd>
        </div>
      ))}
    </dl>
  );
}
