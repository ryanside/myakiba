import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { SHIPPING_METHODS } from "@myakiba/contracts/shared/constants";
import type { Currency, DateFormat } from "@myakiba/contracts/shared/types";
import type {
  ExpenseFilters,
  ExpenseShopFilters,
  ExpenseShopRow,
  ShopExpansionResponse,
} from "@myakiba/contracts/expenses/schema";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { ExpenseOrderRow, ExpenseOrderRowSkeleton } from "@/components/expenses/order-row";
import { EXPENSE_CHART_COLORS } from "@/components/expenses/chart-utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getShopExpansion } from "@/queries/expenses";

type OrdersExpansion = Extract<ShopExpansionResponse, { scope: "orders" }>;
type ShippingExpansion = Extract<ShopExpansionResponse, { scope: "shipping" }>;
type CollectionExpansion = Extract<ShopExpansionResponse, { scope: "collection" }>;

const FEE_CATEGORIES = [
  { key: "shipping", label: "Shipping", color: EXPENSE_CHART_COLORS[1] },
  { key: "taxes", label: "Taxes", color: EXPENSE_CHART_COLORS[2] },
  { key: "duties", label: "Duties", color: EXPENSE_CHART_COLORS[3] },
  { key: "tariffs", label: "Tariffs", color: EXPENSE_CHART_COLORS[4] },
  { key: "miscFees", label: "Misc", color: EXPENSE_CHART_COLORS[5] },
] as const;

export function ShopTableRowExpansion({
  row,
  filters,
  currency,
  locale,
  dateFormat,
}: {
  readonly row: ExpenseShopRow;
  readonly filters: ExpenseFilters;
  readonly currency: Currency;
  readonly locale: string;
  readonly dateFormat: DateFormat;
}): ReactNode {
  const queryFilters: ExpenseShopFilters = {
    scope: row.scope,
    dateStart: filters.dateStart,
    dateEnd: filters.dateEnd,
  };
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["expenses", "shop-expansion", row.id, queryFilters],
    queryFn: () => getShopExpansion(row.id, queryFilters),
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  if (isPending) {
    return (
      <div className="w-full border-t border-border/30 bg-muted/30 p-4" aria-busy="true">
        <ShopExpansionSkeleton scope={row.scope} />
      </div>
    );
  }
  if (isError) {
    return (
      <div className="w-full border-t border-border/30 bg-muted/30 p-4">
        <p className="animate-data-in text-sm text-destructive">Failed to load: {error.message}</p>
      </div>
    );
  }

  let content: ReactNode;
  switch (data.scope) {
    case "collection":
      content = <CollectionExpansionPanel data={data} row={row} filters={filters} />;
      break;
    case "orders":
      content = (
        <div className="flex flex-col gap-6">
          <FeeBreakdownPanel data={data} currency={currency} locale={locale} />
          <TopOrdersPanel
            data={data}
            row={row}
            filters={filters}
            currency={currency}
            locale={locale}
            dateFormat={dateFormat}
            label="Top paid orders"
          />
        </div>
      );
      break;
    default:
      content = (
        <div className="flex flex-col gap-6">
          <ShippingMethodsPanel data={data} currency={currency} locale={locale} />
          <TopOrdersPanel
            data={data}
            row={row}
            filters={filters}
            currency={currency}
            locale={locale}
            dateFormat={dateFormat}
            label="Top orders by shipping"
          />
        </div>
      );
  }

  return <div className="w-full border-t border-border/30 bg-muted/30 p-4">{content}</div>;
}

function SectionLabel({ children }: { readonly children: ReactNode }): ReactNode {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}

function ShopExpansionSkeleton({ scope }: { readonly scope: ExpenseShopRow["scope"] }): ReactNode {
  if (scope === "collection") {
    return (
      <div className="flex flex-col gap-3">
        <ExpansionHeader label="Recent Owned items" />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="size-14 rounded-md" />
          <Skeleton className="size-14 rounded-md" />
          <Skeleton className="size-14 rounded-md" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <SectionLabel>{scope === "orders" ? "Fee breakdown" : "Shipping methods"}</SectionLabel>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <ExpansionHeader
          label={scope === "orders" ? "Top paid orders" : "Top orders by shipping"}
        />
        <div className="divide-y divide-border/30">
          <ExpenseOrderRowSkeleton />
          <ExpenseOrderRowSkeleton />
          <ExpenseOrderRowSkeleton />
        </div>
      </div>
    </div>
  );
}

function ExpansionHeader({ label }: { readonly label: string }): ReactNode {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <SectionLabel>{label}</SectionLabel>
      <Button variant="ghost" size="xs" className="-my-1 -mr-2 text-muted-foreground" disabled>
        View all
      </Button>
    </div>
  );
}

function CollectionExpansionPanel({
  data,
  row,
  filters,
}: {
  readonly data: CollectionExpansion;
  readonly row: ExpenseShopRow;
  readonly filters: ExpenseFilters;
}): ReactNode {
  const shop = row.shop ? [row.shop] : undefined;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-4">
        <SectionLabel>Recent Owned items</SectionLabel>
        <Button
          variant="ghost"
          size="xs"
          className="-my-1 -mr-2 text-muted-foreground"
          render={
            <Link
              to="/collection"
              search={{ shop, payDateStart: filters.dateStart, payDateEnd: filters.dateEnd }}
            />
          }
          nativeButton={false}
        >
          View all
        </Button>
      </div>
      {data.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No collection items.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {data.items.map((item, index) => {
            const linkProps =
              item.externalId !== null
                ? { to: "/item/$externalId" as const, params: { externalId: item.externalId } }
                : { to: "/item/custom/$id" as const, params: { id: item.itemId } };
            return (
              <Link
                key={item.collectionId}
                {...linkProps}
                title={item.title}
                aria-label={item.title}
                className="animate-data-in size-14 overflow-hidden rounded-md bg-background ring-1 ring-border/40"
                style={{ animationDelay: `${index * 30}ms` }}
              >
                {item.image ? (
                  <img
                    src={item.image}
                    alt={item.title}
                    className="size-full object-cover object-top"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center text-[10px] text-muted-foreground">
                    No image
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FeeBreakdownPanel({
  data,
  currency,
  locale,
}: {
  readonly data: OrdersExpansion;
  readonly currency: Currency;
  readonly locale: string;
}): ReactNode {
  const entries = FEE_CATEGORIES.map((category) => ({
    ...category,
    amount: data.feeBreakdown[category.key],
  })).filter((entry) => entry.amount > 0);
  return (
    <div className="flex flex-col gap-3">
      <SectionLabel>Fee breakdown</SectionLabel>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No fees for this shop.</p>
      ) : (
        <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
          {entries.map((entry, index) => (
            <li
              key={entry.key}
              className="animate-data-in flex items-center gap-1.5"
              style={{ animationDelay: `${index * 30}ms` }}
            >
              <span
                aria-hidden
                className="size-1.5 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span>{entry.label}</span>
              <span className="tabular-nums text-muted-foreground">
                {formatCurrencyFromMinorUnits(entry.amount, currency, locale)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ShippingMethodsPanel({
  data,
  currency,
  locale,
}: {
  readonly data: ShippingExpansion;
  readonly currency: Currency;
  readonly locale: string;
}): ReactNode {
  return (
    <div className="flex flex-col gap-3">
      <SectionLabel>Shipping methods</SectionLabel>
      {data.methods.length === 0 ? (
        <p className="text-sm text-muted-foreground">No shipping charges for this shop.</p>
      ) : (
        <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
          {data.methods.map((entry, index) => (
            <li
              key={entry.method}
              className="animate-data-in flex items-center gap-1.5"
              style={{ animationDelay: `${index * 30}ms` }}
            >
              <span
                aria-hidden
                className="size-1.5 rounded-full"
                style={{
                  backgroundColor:
                    EXPENSE_CHART_COLORS[SHIPPING_METHODS.indexOf(entry.method)] ??
                    EXPENSE_CHART_COLORS[0],
                }}
              />
              <span>{entry.method}</span>
              <span className="tabular-nums text-muted-foreground">
                {formatCurrencyFromMinorUnits(entry.spend, currency, locale)}, {entry.orderCount}{" "}
                {entry.orderCount === 1 ? "order" : "orders"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TopOrdersPanel({
  data,
  row,
  filters,
  currency,
  locale,
  dateFormat,
  label,
}: {
  readonly data: OrdersExpansion | ShippingExpansion;
  readonly row: ExpenseShopRow;
  readonly filters: ExpenseFilters;
  readonly currency: Currency;
  readonly locale: string;
  readonly dateFormat: DateFormat;
  readonly label: string;
}): ReactNode {
  const shop = row.shop ? [row.shop] : undefined;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-4">
        <SectionLabel>{label}</SectionLabel>
        <Button
          variant="ghost"
          size="xs"
          className="-my-1 -mr-2 text-muted-foreground"
          render={
            <Link
              to="/orders"
              search={{
                shop,
                expenseDateStart: filters.dateStart,
                expenseDateEnd: filters.dateEnd,
              }}
            />
          }
          nativeButton={false}
        >
          View all
        </Button>
      </div>
      {data.topOrders.length === 0 ? (
        <p className="text-sm text-muted-foreground">No orders.</p>
      ) : (
        <ul className="divide-y divide-border/30">
          {data.topOrders.map((order, index) => (
            <li key={order.orderId}>
              <ExpenseOrderRow
                order={order}
                currency={currency}
                locale={locale}
                dateFormat={dateFormat}
                className="animate-data-in"
                style={{ animationDelay: `${index * 30}ms` }}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
