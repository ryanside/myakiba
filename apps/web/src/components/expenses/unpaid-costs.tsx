import type { CSSProperties, ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import type { Currency, DateFormat } from "@myakiba/contracts/shared/types";
import type {
  ExpenseFilters,
  ExpenseOrder,
  ExpenseUnpaidBreakdown,
} from "@myakiba/contracts/expenses/schema";
import { Section } from "@/components/expenses/section";
import { ExpenseOrderRow, ExpenseOrderRowSkeleton } from "@/components/expenses/order-row";
import { SummaryMetricCell } from "@/components/expenses/overview-summary";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";

interface UnpaidCostsProps {
  readonly breakdown: ExpenseUnpaidBreakdown | undefined;
  readonly orders: readonly ExpenseOrder[] | undefined;
  readonly orderCount: number | undefined;
  readonly filters: ExpenseFilters;
  readonly currency: Currency;
  readonly locale: string;
  readonly dateFormat: DateFormat;
  readonly isLoading?: boolean;
}

const BREAKDOWN_ROWS: readonly {
  readonly key: keyof ExpenseUnpaidBreakdown;
  readonly label: string;
}[] = [
  { key: "items", label: "items" },
  { key: "shipping", label: "shipping" },
  { key: "taxes", label: "taxes" },
  { key: "duties", label: "duties" },
  { key: "tariffs", label: "tariffs" },
  { key: "miscFees", label: "misc" },
];

const ORDER_ROW_BASE_DELAY_MS = 140;
const ORDER_ROW_STAGGER_MS = 30;

export function UnpaidCosts({
  breakdown,
  orders,
  orderCount,
  filters,
  currency,
  locale,
  dateFormat,
  isLoading = false,
}: UnpaidCostsProps): ReactNode {
  const formatCurrency = (value: number): string =>
    formatCurrencyFromMinorUnits(value, currency, locale);
  const breakdownRows = BREAKDOWN_ROWS.map((row) => ({
    ...row,
    amount: breakdown?.[row.key] ?? 0,
  }));
  const total = breakdownRows.reduce((sum, row) => sum + row.amount, 0);
  const hasMoreOrders = (orderCount ?? 0) > (orders?.length ?? 0);
  const orderSearch = {
    status: ["Ordered" as const],
    shop: filters.shop,
    expenseDateStart: filters.dateStart,
    expenseDateEnd: filters.dateEnd,
  };
  const showViewAllLink = !isLoading && (orderCount ?? 0) > 0;

  return (
    <Section title="unpaid" isLoading={isLoading}>
      <div className="flex flex-col">
        <div className="animate-data-in flex flex-col [--data-in-delay:60ms]">
          <SummaryMetricCell
            metric={{ label: "total", value: formatCurrency(total) }}
            isLoading={isLoading}
            variant="hero"
          />
          <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            {breakdownRows.map((row) => (
              <SummaryMetricCell
                key={row.key}
                metric={{ label: row.label, value: formatCurrency(row.amount) }}
                isLoading={isLoading}
                variant="default"
              />
            ))}
          </div>
        </div>

        <div className="animate-data-in mt-6 space-y-3 [--data-in-delay:100ms]">
          <div className="flex min-w-0 items-baseline justify-between gap-4">
            <p className="text-xs text-muted-foreground text-pretty">orders</p>
            {showViewAllLink && orderCount ? (
              <Link
                to="/orders"
                search={orderSearch}
                className="group/link flex shrink-0 items-center gap-1 text-xs text-muted-foreground transition-colors duration-150 ease-out hover:text-foreground active:scale-[0.98]"
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
            {isLoading && (
              <div className="divide-y divide-border/30">
                <ExpenseOrderRowSkeleton />
                <ExpenseOrderRowSkeleton />
              </div>
            )}
            {!isLoading && (!orders || orders.length === 0) && (
              <p className="text-sm text-muted-foreground text-pretty">No unpaid orders</p>
            )}
            {!isLoading && orders && orders.length > 0 && (
              <div className="divide-y divide-border/30">
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
        </div>
      </div>
    </Section>
  );
}
