import type { ChartConfig } from "@/components/evilcharts/ui/chart";
import type { ExpenseTotals } from "@myakiba/contracts/expenses/schema";
import { SHIPPING_METHODS } from "@myakiba/contracts/shared/constants";
import type { ShippingMethod } from "@myakiba/contracts/shared/types";

export const EXPENSE_CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
  "var(--chart-8)",
  "var(--chart-9)",
  "var(--chart-10)",
] as const;

export const shippingMethodChartConfig = Object.fromEntries(
  SHIPPING_METHODS.map((method, index) => [
    method,
    { label: method, colors: { light: [EXPENSE_CHART_COLORS[index]] } },
  ]),
) as Record<ShippingMethod, { label: string; colors: { light: string[] } }> satisfies ChartConfig;

export const EMPTY_EXPENSE_TOTALS: ExpenseTotals = {
  totalSpend: 0,
  feeSpend: 0,
  collectionItemSpend: 0,
  orderItemSpend: 0,
  orderSpend: 0,
  shippingSpend: 0,
  taxesSpend: 0,
  dutiesSpend: 0,
  tariffsSpend: 0,
  miscSpend: 0,
  averageOrderSpend: 0,
  averageCollectionItemSpend: 0,
  averageOrderItemSpend: 0,
  averageFeeSpend: 0,
  averageShippingSpend: 0,
  averageTaxesSpend: 0,
  averageDutiesSpend: 0,
  averageTariffsSpend: 0,
  averageMiscSpend: 0,
  paidOrderCount: 0,
  paidItemCount: 0,
  ownedItemCount: 0,
};
