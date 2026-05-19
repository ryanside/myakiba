import type { CSSProperties, ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import type { Currency, DateFormat } from "@myakiba/contracts/shared/types";
import type { ShopExpansionResponse, ShopFeeBreakdown } from "@myakiba/contracts/expenses/schema";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Spinner } from "@/components/ui/spinner";
import { ExpenseOrderRow } from "@/components/expenses/expense-order-row";
import { getShopExpansion } from "@/queries/expenses";
import type { ShopExpansionFilters } from "@/queries/expenses";
import { cn } from "@/lib/utils";

interface ShopRowExpansionProps {
  readonly shop: string;
  readonly filters: ShopExpansionFilters;
  readonly currency: Currency;
  readonly locale: string;
  readonly dateFormat: DateFormat;
}

const FEE_CATEGORIES: readonly {
  readonly key: keyof ShopFeeBreakdown;
  readonly label: string;
}[] = [
  { key: "shipping", label: "Shipping" },
  { key: "taxes", label: "Taxes" },
  { key: "duties", label: "Duties" },
  { key: "tariffs", label: "Tariffs" },
  { key: "miscFees", label: "Misc" },
];

const FEE_PALETTE = [
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
] as const;

const TOP_ORDERS_BASE_DELAY_MS = 80;
const ITEMS_BASE_DELAY_MS = 160;
const CHILD_STAGGER_MS = 30;

export function ShopRowExpansion({
  shop,
  filters,
  currency,
  locale,
  dateFormat,
}: ShopRowExpansionProps): ReactNode {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["expenses", "shop-expansion", shop, filters],
    queryFn: () => getShopExpansion(shop, filters),
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  if (isPending) {
    return (
      <div className="flex w-full flex-col gap-5 border-t border-border/30 bg-muted/30 p-4">
        <div className="flex min-h-28 w-full items-center justify-center py-6">
          <Spinner className="size-5 text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-5 border-t border-border/30 bg-muted/30 p-4">
      <FeeBreakdownPanel
        data={data}
        isError={isError}
        error={error}
        currency={currency}
        locale={locale}
      />
      <TopOrdersPanel
        data={data}
        shop={shop}
        filters={filters}
        currency={currency}
        locale={locale}
        dateFormat={dateFormat}
      />
      <ItemsPanel data={data} shop={shop} filters={filters} />
    </div>
  );
}

interface PanelProps {
  readonly data: ShopExpansionResponse | undefined;
}

function PanelTitle({ children }: { readonly children: ReactNode }): ReactNode {
  return <p className="text-xs font-medium text-muted-foreground">{children}</p>;
}

function FeeBreakdownPanel({
  data,
  isError,
  error,
  currency,
  locale,
}: PanelProps & {
  readonly isError: boolean;
  readonly error: Error | null;
  readonly currency: Currency;
  readonly locale: string;
}): ReactNode {
  if (isError) {
    return (
      <div className="animate-data-in space-y-2">
        <PanelTitle>Fee breakdown</PanelTitle>
        <p className="text-xs text-destructive">Failed to load: {error?.message}</p>
      </div>
    );
  }
  if (!data) {
    return null;
  }

  const total = FEE_CATEGORIES.reduce((sum, { key }) => sum + data.feeBreakdown[key], 0);
  const entries = FEE_CATEGORIES.map((category, idx) => ({
    ...category,
    amount: data.feeBreakdown[category.key],
    color: FEE_PALETTE[idx % FEE_PALETTE.length],
  })).filter((entry) => entry.amount > 0);

  if (total === 0) {
    return (
      <div className="animate-data-in space-y-2">
        <PanelTitle>Fee breakdown</PanelTitle>
        <p className="text-xs italic text-muted-foreground">No fees for this shop</p>
      </div>
    );
  }

  return (
    <div className="animate-data-in space-y-2">
      <PanelTitle>
        Fee breakdown · {formatCurrencyFromMinorUnits(total, currency, locale)}
      </PanelTitle>
      <TooltipProvider>
        <div className="flex h-2.5 w-full overflow-hidden rounded-sm">
          {entries.map((entry) => {
            const percentage = (entry.amount / total) * 100;
            return (
              <Tooltip key={entry.key}>
                <TooltipTrigger
                  render={
                    <div
                      className="cursor-default first:rounded-l-sm last:rounded-r-sm"
                      style={{
                        width: `${Math.max(percentage, 2)}%`,
                        backgroundColor: entry.color,
                      }}
                    />
                  }
                />
                <TooltipContent side="top">
                  <p className="text-xs font-medium">{entry.label}</p>
                  <p className="text-xs">
                    {formatCurrencyFromMinorUnits(entry.amount, currency, locale)} ·{" "}
                    {percentage.toFixed(1)}%
                  </p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {entries.map((entry) => (
          <li key={entry.key} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-1.5 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span>{entry.label}</span>
            <span className="tabular-nums">
              {formatCurrencyFromMinorUnits(entry.amount, currency, locale)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TopOrdersPanel({
  data,
  shop,
  filters,
  currency,
  locale,
  dateFormat,
}: PanelProps & {
  readonly shop: string;
  readonly filters: ShopExpansionFilters;
  readonly currency: Currency;
  readonly locale: string;
  readonly dateFormat: DateFormat;
}): ReactNode {
  let ordersBody: ReactNode;
  if (!data) {
    ordersBody = null;
  } else if (data.topOrders.length === 0) {
    ordersBody = <p className="text-xs italic text-muted-foreground">No orders</p>;
  } else {
    ordersBody = (
      <ul className="divide-y divide-border/30">
        {data.topOrders.map((order, idx) => (
          <li key={order.orderId}>
            <ExpenseOrderRow
              order={order}
              currency={currency}
              locale={locale}
              dateFormat={dateFormat}
              className="animate-data-in"
              style={
                {
                  "--data-in-delay": `${TOP_ORDERS_BASE_DELAY_MS + idx * CHILD_STAGGER_MS}ms`,
                } as CSSProperties
              }
            />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div
      className="animate-data-in space-y-2"
      style={{ "--data-in-delay": `${TOP_ORDERS_BASE_DELAY_MS}ms` } as CSSProperties}
    >
      <div className="flex items-baseline justify-between gap-2">
        <PanelTitle>Top orders</PanelTitle>
        <Link
          to="/orders"
          search={{
            shop: [shop],
            payDateStart: filters.dateStart,
            payDateEnd: filters.dateEnd,
            status: filters.status,
          }}
          className="group/link flex items-center gap-1 text-xs text-muted-foreground transition-colors duration-150 ease-out hover:text-foreground active:scale-[0.98]"
        >
          View all
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            className="size-3 shrink-0 transition-transform duration-150 ease-out group-hover/link:translate-x-0.5"
            aria-hidden
          />
        </Link>
      </div>
      {ordersBody}
    </div>
  );
}

function ItemsPanel({
  data,
  shop,
  filters,
}: PanelProps & {
  readonly shop: string;
  readonly filters: ShopExpansionFilters;
}): ReactNode {
  let itemsBody: ReactNode;
  if (!data) {
    itemsBody = null;
  } else if (data.items.length === 0) {
    itemsBody = <p className="text-xs italic text-muted-foreground">No items</p>;
  } else {
    itemsBody = (
      <div className="flex flex-wrap gap-1.5">
        {data.items.map((item, idx) => {
          const linkProps =
            item.externalId !== null
              ? ({
                  to: "/item/$externalId",
                  params: { externalId: item.externalId },
                } as const)
              : ({ to: "/item/custom/$id", params: { id: item.itemId } } as const);

          return (
            <Link
              key={item.collectionId}
              {...linkProps}
              title={item.title}
              aria-label={item.title}
              className={cn(
                "animate-data-in size-14 shrink-0 overflow-hidden rounded-md bg-background ring-1 ring-border/40",
                "transition-transform duration-150 ease-out hover:scale-[1.02] active:scale-[0.99]",
              )}
              style={
                {
                  "--data-in-delay": `${ITEMS_BASE_DELAY_MS + idx * CHILD_STAGGER_MS}ms`,
                } as CSSProperties
              }
            >
              {item.image ? (
                <img
                  src={item.image}
                  alt={item.title}
                  className="h-full w-full object-cover object-top"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
                  No image
                </div>
              )}
            </Link>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className="animate-data-in space-y-2"
      style={{ "--data-in-delay": `${ITEMS_BASE_DELAY_MS}ms` } as CSSProperties}
    >
      <div className="flex items-baseline justify-between gap-2">
        <PanelTitle>Items</PanelTitle>
        <Link
          to="/collection"
          search={{
            shop: [shop],
            payDateStart: filters.dateStart,
            payDateEnd: filters.dateEnd,
          }}
          className="group/link flex items-center gap-1 text-xs text-muted-foreground transition-colors duration-150 ease-out hover:text-foreground active:scale-[0.98]"
        >
          View all
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            className="size-3 shrink-0 transition-transform duration-150 ease-out group-hover/link:translate-x-0.5"
            aria-hidden
          />
        </Link>
      </div>
      {itemsBody}
    </div>
  );
}
