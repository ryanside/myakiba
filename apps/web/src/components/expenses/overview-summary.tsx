import type { ReactNode } from "react";
import type { Currency } from "@myakiba/contracts/shared/types";
import type { ExpenseTotals } from "@myakiba/contracts/expenses/schema";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { Section } from "@/components/expenses/section";
import { Skeleton } from "@/components/ui/skeleton";

interface OverviewSummaryProps {
  readonly totals: ExpenseTotals;
  readonly isLoading: boolean;
  readonly currency: Currency;
  readonly locale: string;
}

export interface SummaryMetric {
  readonly label: string;
  readonly value: string;
}

const SUMMARY_METRICS: readonly { readonly label: string; readonly key: keyof ExpenseTotals }[] = [
  { label: "total", key: "totalSpend" },
  { label: "orders", key: "orderSpend" },
  { label: "order avg", key: "averageOrderSpend" },
  { label: "collection items", key: "collectionItemSpend" },
  { label: "collection item avg", key: "averageCollectionItemSpend" },
  { label: "order items", key: "orderItemSpend" },
  { label: "order item avg", key: "averageOrderItemSpend" },
  { label: "fees", key: "feeSpend" },
  { label: "fee avg", key: "averageFeeSpend" },
  { label: "shipping", key: "shippingSpend" },
  { label: "shipping avg", key: "averageShippingSpend" },
  { label: "taxes", key: "taxesSpend" },
  { label: "taxes avg", key: "averageTaxesSpend" },
  { label: "duties", key: "dutiesSpend" },
  { label: "duties avg", key: "averageDutiesSpend" },
  { label: "tariffs", key: "tariffsSpend" },
  { label: "tariffs avg", key: "averageTariffsSpend" },
  { label: "misc", key: "miscSpend" },
  { label: "misc avg", key: "averageMiscSpend" },
];

function buildSummaryMetrics(
  totals: ExpenseTotals,
  currency: Currency,
  locale: string,
): readonly SummaryMetric[] {
  const format = (value: number): string => formatCurrencyFromMinorUnits(value, currency, locale);

  return SUMMARY_METRICS.map(({ label, key }) => ({
    label,
    value: format(totals[key]),
  }));
}

export function OverviewSummary({
  totals,
  isLoading,
  currency,
  locale,
}: OverviewSummaryProps): ReactNode {
  const [hero, ...metrics] = buildSummaryMetrics(totals, currency, locale);

  return (
    <Section title="summary" isLoading={isLoading}>
      <div className="flex flex-col">
        <SummaryMetricCell metric={hero} isLoading={isLoading} variant="hero" />
        <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
          {metrics.map((metric) => (
            <SummaryMetricCell
              key={metric.label}
              metric={metric}
              isLoading={isLoading}
              variant="default"
            />
          ))}
        </div>
      </div>
    </Section>
  );
}

export function SummaryMetricCell({
  metric,
  isLoading,
  variant,
}: {
  readonly metric: SummaryMetric;
  readonly isLoading: boolean;
  readonly variant: "hero" | "default";
}): ReactNode {
  const isHero = variant === "hero";

  return (
    <div
      className={
        isHero ? "animate-data-in flex flex-col gap-1" : "animate-data-in flex flex-col gap-0.5"
      }
    >
      <p className="text-xs text-muted-foreground text-pretty">{metric.label}</p>
      <p
        className={
          isHero
            ? "text-2xl font-medium leading-none tracking-tight tabular-nums"
            : "text-sm font-medium tracking-tight tabular-nums"
        }
      >
        {isLoading ? <Skeleton className={isHero ? "h-6 w-24" : "h-5 w-16"} /> : metric.value}
      </p>
    </div>
  );
}
