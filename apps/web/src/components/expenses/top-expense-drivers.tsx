import type { CSSProperties, ReactNode } from "react";
import type { Currency, DateFormat } from "@myakiba/contracts/shared/types";
import { ExpenseLedgerBand, ExpenseLedgerEmpty } from "@/components/expenses/expense-ledger";
import { Skeleton } from "@/components/ui/skeleton";
import { ExpenseOrderRow } from "@/components/expenses/expense-order-row";
import type { TopExpenseDriver } from "@/queries/expenses";

interface TopExpenseDriversProps {
  readonly drivers: readonly TopExpenseDriver[] | undefined;
  readonly currency: Currency;
  readonly locale: string;
  readonly dateFormat: DateFormat;
  readonly isLoading?: boolean;
}

function TopExpenseDriversLoadingSkeleton(): ReactNode {
  return (
    <section className="border-t border-border">
      <ExpenseLedgerBand title="top expenses">
        <div className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </ExpenseLedgerBand>
    </section>
  );
}

export function TopExpenseDrivers({
  drivers,
  currency,
  locale,
  dateFormat,
  isLoading,
}: TopExpenseDriversProps): ReactNode {
  if (isLoading) {
    return <TopExpenseDriversLoadingSkeleton />;
  }

  return (
    <section className="border-t border-border">
      <ExpenseLedgerBand title="top expenses">
        {!drivers || drivers.length === 0 ? (
          <ExpenseLedgerEmpty>No expense drivers yet</ExpenseLedgerEmpty>
        ) : (
          <div>
            {drivers.map((driver, idx) => (
              <ExpenseOrderRow
                key={driver.orderId}
                order={driver}
                currency={currency}
                locale={locale}
                dateFormat={dateFormat}
                className="animate-data-in"
                style={{ "--data-in-delay": `${idx * 30}ms` } as CSSProperties}
              />
            ))}
          </div>
        )}
      </ExpenseLedgerBand>
    </section>
  );
}
