import type { Currency } from "@myakiba/contracts/shared/types";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import {
  ExpenseLedgerBand,
  ExpenseLedgerMetric,
  ExpenseLedgerMetricsGrid,
} from "@/components/expenses/expense-ledger";
import type { ExpenseSummary } from "@/queries/expenses";

interface ExpensesSummaryCardsProps {
  readonly summary: ExpenseSummary | undefined;
  readonly currency: Currency;
  readonly locale: string;
  readonly isLoading?: boolean;
}

export function ExpensesSummaryCards({
  summary,
  currency,
  locale,
  isLoading,
}: ExpensesSummaryCardsProps): React.ReactNode {
  return (
    <section className="border-t border-border">
      <ExpenseLedgerBand title="spend" leading>
        <ExpenseLedgerMetricsGrid>
          <ExpenseLedgerMetric
            title="total"
            value={
              summary
                ? formatCurrencyFromMinorUnits(summary.totalSpend, currency, locale)
                : undefined
            }
            subtitle="items + fees"
            isLoading={isLoading}
          />
          <ExpenseLedgerMetric
            title="item"
            value={
              summary
                ? formatCurrencyFromMinorUnits(summary.itemSpend, currency, locale)
                : undefined
            }
            subtitle="item prices"
            isLoading={isLoading}
          />
          <ExpenseLedgerMetric
            title="fee"
            value={
              summary ? formatCurrencyFromMinorUnits(summary.feeSpend, currency, locale) : undefined
            }
            subtitle="shipping, taxes, duties, tariffs, misc"
            isLoading={isLoading}
          />
        </ExpenseLedgerMetricsGrid>
      </ExpenseLedgerBand>

      <ExpenseLedgerBand title="averages">
        <ExpenseLedgerMetricsGrid>
          <ExpenseLedgerMetric
            title="order"
            value={
              summary ? formatCurrencyFromMinorUnits(summary.avgOrder, currency, locale) : undefined
            }
            subvalueTitle="orders"
            subtitle="total spend / orders"
            isLoading={isLoading}
          />
          <ExpenseLedgerMetric
            title="item"
            value={
              summary ? formatCurrencyFromMinorUnits(summary.avgItem, currency, locale) : undefined
            }
            subvalueTitle="items"
            subtitle="item spend / items"
            isLoading={isLoading}
          />
          <ExpenseLedgerMetric
            title="fee"
            value={
              summary ? formatCurrencyFromMinorUnits(summary.avgFee, currency, locale) : undefined
            }
            subtitle="fee spend / orders"
            isLoading={isLoading}
          />
        </ExpenseLedgerMetricsGrid>
      </ExpenseLedgerBand>
    </section>
  );
}
