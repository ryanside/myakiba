import type { ReactElement } from "react";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { CostBreakdown } from "@/components/dashboard/cost-breakdown";
import OrderKanban from "@/components/dashboard/order-kanban";
import { ReleaseCalendar } from "@/components/dashboard/release-calendar";
import { ShopBreakdown } from "@/components/dashboard/shop-breakdown";
import { KPICard, KPIGroup } from "@/components/ui/kpi-card";
import type { DateFormat, Currency } from "@myakiba/contracts/shared/types";
import { LoadError } from "@/components/page-states";
import type { MonthlyData } from "@/queries/dashboard";

interface MonthlyTabProps {
  readonly data: MonthlyData | undefined;
  readonly dataUpdatedAt: number;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly error: Error | null;
  readonly currency: Currency;
  readonly locale: string;
  readonly dateFormat: DateFormat;
  readonly month: number;
  readonly year: number;
}

export function MonthlyTab({
  data,
  dataUpdatedAt,
  isLoading,
  isError,
  error,
  currency,
  locale,
  dateFormat,
  month,
  year,
}: MonthlyTabProps): ReactElement {
  if (isError) {
    return <LoadError title="Couldn't load this month" error={error} />;
  }

  const {
    itemCount,
    orderCount,
    unpaidOrderCount,
    paidAmount,
    unpaidAmount,
    shopBreakdown,
    costBreakdown,
    orders,
  } = data ?? {
    itemCount: 0,
    orderCount: 0,
    unpaidOrderCount: 0,
    paidAmount: 0,
    unpaidAmount: 0,
    shopBreakdown: [],
    costBreakdown: { items: 0, shipping: 0, taxes: 0, duties: 0, tariffs: 0, miscFees: 0 },
    orders: [],
  };

  return (
    <>
      <KPIGroup>
        <KPICard title="Total Items" value={itemCount} isLoading={isLoading} />
        <KPICard
          title="Total Orders"
          value={orderCount}
          subvalueTitle="unpaid"
          subvalue={unpaidOrderCount}
          isLoading={isLoading}
        />
        <KPICard
          title="Paid Costs"
          value={formatCurrencyFromMinorUnits(paidAmount, currency, locale)}
          isLoading={isLoading}
        />
        <KPICard
          title="Unpaid Costs"
          value={formatCurrencyFromMinorUnits(unpaidAmount, currency, locale)}
          isLoading={isLoading}
        />
      </KPIGroup>
      <div className="mt-2 grid grid-cols-1 gap-x-10 gap-y-6 lg:grid-cols-3">
        <ShopBreakdown
          data={shopBreakdown}
          currency={currency}
          locale={locale}
          isLoading={isLoading}
          isError={isError}
        />
        <CostBreakdown
          data={costBreakdown}
          currency={currency}
          locale={locale}
          isLoading={isLoading}
          isError={isError}
        />
        <ReleaseCalendar currency={currency} month={month} year={year} hideControls />
      </div>
      <OrderKanban
        orders={orders}
        ordersUpdatedAt={dataUpdatedAt}
        isLoading={isLoading}
        currency={currency}
        dateFormat={dateFormat}
      />
    </>
  );
}
