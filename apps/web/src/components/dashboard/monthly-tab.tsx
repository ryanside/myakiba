import type { ReactElement } from "react";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { CostBreakdown } from "@/components/dashboard/cost-breakdown";
import OrderKanban from "@/components/dashboard/order-kanban";
import { ReleaseCalendar } from "@/components/dashboard/release-calendar";
import { ShopBreakdown } from "@/components/dashboard/shop-breakdown";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KPICard } from "@/components/ui/kpi-card";
import type { DateFormat, Currency } from "@myakiba/contracts/shared/types";
import type { MonthlyData } from "@/queries/dashboard";

interface MonthlyTabProps {
  readonly data: MonthlyData | undefined;
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
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-destructive">Error</CardTitle>
          <CardDescription>Failed to load monthly data: {error?.message}</CardDescription>
        </CardHeader>
      </Card>
    );
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
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="Total Items"
          subtitle="items in orders this month"
          value={itemCount}
          isLoading={isLoading}
        />
        <KPICard
          title="Total Orders"
          subtitle="orders releasing this month"
          value={orderCount}
          subvalueTitle="unpaid"
          subvalue={unpaidOrderCount}
          isLoading={isLoading}
        />
        <KPICard
          title="Paid Costs"
          subtitle="total paid order costs"
          value={formatCurrencyFromMinorUnits(paidAmount, currency, locale)}
          isLoading={isLoading}
        />
        <KPICard
          title="Unpaid Costs"
          subtitle="total unpaid order costs"
          value={formatCurrencyFromMinorUnits(unpaidAmount, currency, locale)}
          isLoading={isLoading}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ShopBreakdown
          data={shopBreakdown}
          currency={currency}
          locale={locale}
          isLoading={isLoading}
        />
        <CostBreakdown
          data={costBreakdown}
          currency={currency}
          locale={locale}
          isLoading={isLoading}
        />
        <ReleaseCalendar currency={currency} month={month} year={year} hideControls />
      </div>
      <OrderKanban
        orders={orders}
        isLoading={isLoading}
        currency={currency}
        dateFormat={dateFormat}
      />
    </>
  );
}
