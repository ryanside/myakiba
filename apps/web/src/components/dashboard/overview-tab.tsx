import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { CollectionBreakdown } from "@/components/dashboard/collection-breakdown";
import OrderKanban from "@/components/dashboard/order-kanban";
import { OrdersBarChart } from "@/components/dashboard/orders-bar-chart";
import { ReleaseCalendar } from "@/components/dashboard/release-calendar";
import { KPICard, KPIGroup } from "@/components/ui/kpi-card";
import type { DateFormat, Currency } from "@myakiba/contracts/shared/types";
import { LoadError } from "@/components/page-states";
import type { DashboardResponse } from "@/queries/dashboard";

interface OverviewTabProps {
  readonly data: DashboardResponse | undefined;
  readonly dataUpdatedAt: number;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly error: Error | null;
  readonly currency: Currency;
  readonly locale: string;
  readonly dateFormat: DateFormat;
}

export function OverviewTab({
  data,
  dataUpdatedAt,
  isLoading,
  isError,
  error,
  currency,
  locale,
  dateFormat,
}: OverviewTabProps) {
  if (isError) {
    return <LoadError title="Couldn't load the dashboard" error={error} />;
  }
  const {
    collectionStats,
    categoriesOwned,
    orders,
    ordersSummary,
    unpaidOrderCount,
    unpaidCosts,
    monthlyOrders,
  } = data ?? {
    collectionStats: { totalItems: 0, totalSpent: 0 },
    categoriesOwned: [],
    orders: [],
    ordersSummary: {
      totalShippingAllTime: 0,
      totalTaxesAllTime: 0,
      totalDutiesAllTime: 0,
      totalTariffsAllTime: 0,
      totalMiscFeesAllTime: 0,
    },
    unpaidOrderCount: 0,
    unpaidCosts: 0,
    monthlyOrders: [],
  };

  const totalSpent =
    Number(collectionStats.totalSpent) +
    Number(ordersSummary.totalShippingAllTime) +
    Number(ordersSummary.totalTaxesAllTime) +
    Number(ordersSummary.totalDutiesAllTime) +
    Number(ordersSummary.totalTariffsAllTime) +
    Number(ordersSummary.totalMiscFeesAllTime);

  return (
    <>
      <KPIGroup>
        <KPICard title="Total Items" value={collectionStats.totalItems} isLoading={isLoading} />
        <KPICard
          title="Total Spent"
          value={formatCurrencyFromMinorUnits(totalSpent, currency, locale)}
          isLoading={isLoading}
        />
        <KPICard
          title="Active Orders"
          value={ordersSummary.totalActiveOrderCount}
          subvalueTitle="unpaid"
          subvalue={unpaidOrderCount}
          isLoading={isLoading}
        />
        <KPICard
          title="Unpaid Costs"
          value={formatCurrencyFromMinorUnits(unpaidCosts, currency, locale)}
          isLoading={isLoading}
        />
      </KPIGroup>
      <div className="mt-2 grid grid-cols-1 gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1fr)]">
        <CollectionBreakdown
          data={categoriesOwned}
          currency={currency}
          locale={locale}
          isLoading={isLoading}
          isError={isError}
        />
        <OrdersBarChart data={monthlyOrders} isLoading={isLoading} />
        <ReleaseCalendar currency={currency} />
      </div>

      <section className="flex flex-col gap-3">
        <SectionHeading title="In progress" scope="Recent and upcoming" />
        <OrderKanban
          orders={orders}
          ordersUpdatedAt={dataUpdatedAt}
          isLoading={isLoading}
          currency={currency}
          dateFormat={dateFormat}
        />
      </section>
    </>
  );
}

function SectionHeading({ title, scope }: { readonly title: string; readonly scope: string }) {
  return (
    <div className="flex items-baseline gap-2.5">
      <h2 className="text-[1.0625rem] font-medium tracking-tight">{title}</h2>
      <p className="text-sm text-muted-foreground">{scope}</p>
    </div>
  );
}
