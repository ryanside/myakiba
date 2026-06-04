import type { ReactNode } from "react";
import type { Currency } from "@myakiba/contracts/shared/types";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import {
  ActiveDot,
  Dot,
  EvilLineChart,
  Grid,
  Legend,
  Line,
  Tooltip,
  XAxis,
  YAxis,
} from "@/components/evilcharts/charts/line-chart";
import type { ChartConfig } from "@/components/evilcharts/ui/chart";
import { Section } from "@/components/expenses/section";
import type { Stat } from "@/components/expenses/section";

type ValidateConfigKeys<TData, TConfig> = {
  [K in keyof TConfig]: K extends keyof TData ? ChartConfig[string] : never;
};

interface ExpenseMetricLineChartProps<
  TRow extends Record<string, string | number>,
  TConfig extends Record<string, ChartConfig[string]>,
> {
  readonly title: string;
  readonly config: TConfig & ValidateConfigKeys<TRow, TConfig>;
  readonly data: readonly TRow[];
  readonly xDataKey: keyof TRow & string;
  readonly lineDataKeys?: readonly (keyof TRow & string)[];
  readonly stats: readonly Stat[];
  readonly isLoading: boolean;
  readonly currency: Currency;
  readonly locale: string;
  readonly children?: ReactNode;
}

export function ExpenseMetricLineChart<
  TRow extends Record<string, string | number>,
  TConfig extends Record<string, ChartConfig[string]>,
>({
  title,
  config,
  data,
  xDataKey,
  lineDataKeys,
  stats,
  isLoading,
  currency,
  locale,
  children,
}: ExpenseMetricLineChartProps<TRow, TConfig>): ReactNode {
  const formatCurrency = (value: number): string =>
    formatCurrencyFromMinorUnits(value, currency, locale);
  const formatCurrencyTick = (value: string | number): string =>
    formatCurrencyFromMinorUnits(Number(value), currency, locale);

  return (
    <Section title={title} isLoading={isLoading} stats={stats}>
      <EvilLineChart<TRow, TConfig>
        data={[...data]}
        config={config}
        isLoading={isLoading}
        xDataKey={xDataKey}
        className="h-80"
      >
        <Grid />
        <XAxis dataKey={xDataKey} />
        <YAxis tickFormatter={formatCurrencyTick} width={80} />
        <Tooltip valueFormatter={formatCurrency} />
        <Legend isClickable />
        {children ??
          lineDataKeys?.map((dataKey) => (
            <Line key={dataKey} dataKey={dataKey} isClickable>
              <Dot variant="colored-border" />
              <ActiveDot variant="border" />
            </Line>
          ))}
      </EvilLineChart>
    </Section>
  );
}
