import type { CSSProperties, ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import type { Currency, DateFormat } from "@myakiba/contracts/shared/types";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import type { ExpenseCostBreakdown, ExpenseFilters, ExpenseOrder } from "@/queries/expenses";
import { ExpenseOrderRow } from "@/components/expenses/expense-order-row";
import { ExpenseLedgerBand, ExpenseLedgerEmpty } from "@/components/expenses/expense-ledger";
import { Skeleton } from "@/components/ui/skeleton";

interface UnpaidCostsSectionProps {
  readonly breakdown: ExpenseCostBreakdown | undefined;
  readonly orders: readonly ExpenseOrder[] | undefined;
  readonly orderCount: number | undefined;
  readonly filters: ExpenseFilters;
  readonly currency: Currency;
  readonly locale: string;
  readonly dateFormat: DateFormat;
  readonly isLoading?: boolean;
}

const BREAKDOWN_ROWS: readonly {
  readonly key: keyof ExpenseCostBreakdown;
  readonly label: string;
}[] = [
  { key: "items", label: "Items" },
  { key: "shipping", label: "Shipping" },
  { key: "taxes", label: "Taxes" },
  { key: "duties", label: "Duties" },
  { key: "tariffs", label: "Tariffs" },
  { key: "miscFees", label: "Misc" },
];

const ORDER_ROW_BASE_DELAY_MS = 140;
const ORDER_ROW_STAGGER_MS = 30;

function UnpaidCostsLoadingSkeleton(): ReactNode {
  return (
    <section className="border-t border-border">
      <ExpenseLedgerBand title="unpaid">
        <div className="space-y-3">
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-8 w-28" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-3/5" />
          </div>
        </div>
      </ExpenseLedgerBand>
      <ExpenseLedgerBand>
        <div className="space-y-3">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </ExpenseLedgerBand>
    </section>
  );
}

export function UnpaidCostsSection({
  breakdown,
  orders,
  orderCount,
  filters,
  currency,
  locale,
  dateFormat,
  isLoading,
}: UnpaidCostsSectionProps): ReactNode {
  if (isLoading) {
    return <UnpaidCostsLoadingSkeleton />;
  }

  const rows = breakdown
    ? BREAKDOWN_ROWS.map((row) => ({ ...row, amount: breakdown[row.key] })).filter(
        (row) => row.amount > 0,
      )
    : [];
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  const hasMoreOrders = (orderCount ?? 0) > (orders?.length ?? 0);
  const orderSearch = {
    status: ["Ordered" as const],
    shop: filters.shop,
    payDateStart: filters.dateStart,
    payDateEnd: filters.dateEnd,
  };

  return (
    <section className="border-t border-border">
      <ExpenseLedgerBand title="unpaid">
        <div className="animate-data-in space-y-3 [--data-in-delay:60ms]">
          <p className="text-xs font-medium text-muted-foreground">Total</p>
          <p className="text-2xl font-medium tabular-nums leading-none tracking-tight">
            {formatCurrencyFromMinorUnits(total, currency, locale)}
          </p>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No unpaid costs in this view</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {rows.map((row) => (
                <li key={row.key} className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{row.label}</span>
                  <span className="font-medium tabular-nums">
                    {formatCurrencyFromMinorUnits(row.amount, currency, locale)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </ExpenseLedgerBand>

      <ExpenseLedgerBand>
        <div className="animate-data-in flex min-w-0 items-baseline justify-between gap-2 [--data-in-delay:100ms]">
          <p className="text-xs font-medium text-muted-foreground">Orders</p>
          {orderCount ? (
            <Link
              to="/orders"
              search={orderSearch}
              className="group/link flex items-center gap-1 text-xs text-muted-foreground transition-colors duration-150 ease-out hover:text-foreground active:scale-[0.98]"
            >
              {hasMoreOrders ? `View all ${orderCount}` : "View all"}
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                className="size-3 shrink-0 transition-transform duration-150 ease-out group-hover/link:translate-x-0.5"
                aria-hidden
              />
            </Link>
          ) : null}
        </div>

        <div className="min-w-0">
          {!orders || orders.length === 0 ? (
            <ExpenseLedgerEmpty className="animate-data-in [--data-in-delay:120ms]">
              No unpaid orders
            </ExpenseLedgerEmpty>
          ) : (
            <div>
              {orders.map((order, idx) => (
                <ExpenseOrderRow
                  key={order.orderId}
                  order={order}
                  currency={currency}
                  locale={locale}
                  dateFormat={dateFormat}
                  className="animate-data-in"
                  style={
                    {
                      "--data-in-delay": `${ORDER_ROW_BASE_DELAY_MS + idx * ORDER_ROW_STAGGER_MS}ms`,
                    } as CSSProperties
                  }
                />
              ))}
            </div>
          )}
        </div>
      </ExpenseLedgerBand>
    </section>
  );
}
