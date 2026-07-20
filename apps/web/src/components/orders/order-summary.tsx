import type { ReactNode } from "react";
import type { Order } from "@myakiba/contracts/orders/types";
import type { DateFormat, Currency } from "@myakiba/contracts/shared/types";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { formatDateOnlyForDisplay } from "@/lib/date-display";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Timeline,
  TimelineItem,
  TimelineIndicator,
  TimelineSeparator,
  TimelineHeader,
  TimelineTitle,
  TimelineDate,
} from "@/components/reui/timeline";

const STATUS_TO_STEP: Readonly<Record<string, number>> = {
  ordered: 1,
  paid: 2,
  shipped: 3,
  owned: 4,
};

function CostRow({
  label,
  amount,
  currency,
  locale,
  animateRow,
}: {
  readonly label: string;
  readonly amount: number;
  readonly currency: Currency;
  readonly locale: string;
  readonly animateRow: boolean;
}): ReactNode {
  return (
    <div
      className={
        animateRow
          ? "animate-data-in flex items-center justify-between text-sm"
          : "flex items-center justify-between text-sm"
      }
    >
      <span className="text-muted-foreground">{label}</span>
      <span className={animateRow ? "tabular-nums" : "animate-data-in tabular-nums"}>
        {formatCurrencyFromMinorUnits(amount, currency, locale)}
      </span>
    </div>
  );
}

export function OrderSummary({
  order,
  isLoading,
  currency,
  locale,
  dateFormat,
}: {
  readonly order: Order | undefined;
  readonly isLoading: boolean;
  readonly currency: Currency;
  readonly locale: string;
  readonly dateFormat: DateFormat;
}): ReactNode {
  const activeStep = order ? (STATUS_TO_STEP[order.status.toLowerCase()] ?? 0) : 0;

  const shippingFee = order?.shippingFee ?? 0;
  const taxes = order?.taxes ?? 0;
  const duties = order?.duties ?? 0;
  const tariffs = order?.tariffs ?? 0;
  const miscFees = order?.miscFees ?? 0;
  const totalAmount = order?.total ?? 0;
  const itemsTotal = totalAmount - shippingFee - taxes - duties - tariffs - miscFees;

  const timelineSteps = [
    { step: 1, title: "Ordered", date: order?.orderDate },
    { step: 2, title: "Paid", date: order?.paymentDate },
    { step: 3, title: "Shipped", date: order?.shippingDate },
    { step: 4, title: "Collected", date: order?.collectionDate },
  ] as const;

  const costRows = [
    { label: "Items", amount: itemsTotal },
    { label: "Shipping", amount: shippingFee },
    ...[
      { label: "Taxes", amount: taxes },
      { label: "Duties", amount: duties },
      { label: "Tariffs", amount: tariffs },
      { label: "Other fees", amount: miscFees },
    ].filter(({ amount }) => amount > 0),
  ];

  return (
    <div className="grid gap-8 lg:grid-cols-[3fr_2fr]" aria-busy={isLoading}>
      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-medium text-muted-foreground">Progress</h2>
        <Timeline orientation="horizontal" value={isLoading ? 0 : activeStep}>
          {timelineSteps.map(({ step, title, date }) => {
            let dateContent: ReactNode = "—";

            if (isLoading) {
              dateContent = <Skeleton className="h-3 w-12 max-w-full" />;
            } else {
              dateContent = (
                <span className="animate-data-in">
                  {date ? formatDateOnlyForDisplay(date, dateFormat) : "—"}
                </span>
              );
            }

            return (
              <TimelineItem key={step} step={step}>
                <TimelineIndicator />
                <TimelineSeparator />
                <TimelineHeader>
                  <TimelineTitle>{title}</TimelineTitle>
                </TimelineHeader>
                <TimelineDate>{dateContent}</TimelineDate>
              </TimelineItem>
            );
          })}
        </Timeline>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-medium text-muted-foreground">Cost Breakdown</h2>
        <div className="flex flex-col gap-2.5">
          {isLoading
            ? ["Items", "Shipping"].map((label) => (
                <div key={label} className="flex items-center justify-between gap-8 text-sm">
                  <span className="text-muted-foreground">{label}</span>
                  <Skeleton className="h-4 w-20" />
                </div>
              ))
            : costRows.map(({ label, amount }, index) => (
                <CostRow
                  key={label}
                  label={label}
                  amount={amount}
                  currency={currency}
                  locale={locale}
                  animateRow={index >= 2}
                />
              ))}
        </div>
        <div className="flex min-h-7 items-center justify-between">
          <span className="text-sm font-medium">Total</span>
          {isLoading ? (
            <Skeleton className="h-6 w-24" />
          ) : (
            <span className="animate-data-in text-lg font-medium tracking-tight tabular-nums">
              {formatCurrencyFromMinorUnits(totalAmount, currency, locale)}
            </span>
          )}
        </div>
      </section>
    </div>
  );
}
