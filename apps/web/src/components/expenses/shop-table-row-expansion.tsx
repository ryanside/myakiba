import type { CSSProperties, ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import type { Currency, DateFormat } from "@myakiba/contracts/shared/types";
import type {
  ExpenseFilters,
  ShopExpansionResponse,
  ShopFeeBreakdown,
} from "@myakiba/contracts/expenses/schema";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { ExpenseOrderRow } from "@/components/expenses/order-row";
import { EXPENSE_CHART_COLORS } from "@/components/expenses/chart-utils";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getShopExpansion } from "@/queries/expenses";
import { cn } from "@/lib/utils";

interface ShopTableRowExpansionProps {
  readonly shop: string;
  readonly filters: ExpenseFilters;
  readonly currency: Currency;
  readonly locale: string;
  readonly dateFormat: DateFormat;
}

const FEE_CATEGORIES: readonly {
  readonly key: keyof ShopFeeBreakdown;
  readonly label: string;
}[] = [
  { key: "shipping", label: "shipping" },
  { key: "taxes", label: "taxes" },
  { key: "duties", label: "duties" },
  { key: "tariffs", label: "tariffs" },
  { key: "miscFees", label: "misc" },
];

const TOP_ORDERS_BASE_DELAY_MS = 80;
const ITEMS_BASE_DELAY_MS = 160;
const CHILD_STAGGER_MS = 30;

export function ShopTableRowExpansion({
  shop,
  filters,
  currency,
  locale,
  dateFormat,
}: ShopTableRowExpansionProps): ReactNode {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["expenses", "shop-expansion", shop, filters],
    queryFn: () => getShopExpansion(shop, filters),
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  if (isPending) {
    return (
      <div className="flex w-full flex-col border-t border-border/30 bg-muted/30 p-4">
        <div className="flex min-h-28 w-full items-center justify-center py-6">
          <Spinner className="size-5 text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex w-full flex-col border-t border-border/30 bg-muted/30 p-4">
        <p className="text-sm text-destructive text-pretty">Failed to load: {error.message}</p>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-6 border-t border-border/30 bg-muted/30 p-4">
      <FeeBreakdownPanel data={data} currency={currency} locale={locale} />
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

function SectionLabel({ children }: { readonly children: ReactNode }): ReactNode {
  return <p className="flex items-center gap-1.5 text-xs text-muted-foreground">{children}</p>;
}

function FeeBreakdownPanel({
  data,
  currency,
  locale,
}: {
  readonly data: ShopExpansionResponse;
  readonly currency: Currency;
  readonly locale: string;
}): ReactNode {
  const total = FEE_CATEGORIES.reduce((sum, { key }) => sum + data.feeBreakdown[key], 0);
  const entries = FEE_CATEGORIES.map((category, idx) => ({
    ...category,
    amount: data.feeBreakdown[category.key],
    color: EXPENSE_CHART_COLORS[(idx + 1) % EXPENSE_CHART_COLORS.length],
  })).filter((entry) => entry.amount > 0);

  if (total === 0) {
    return (
      <div className="animate-data-in space-y-3">
        <SectionLabel>fee breakdown</SectionLabel>
        <p className="text-sm text-muted-foreground text-pretty">No fees for this shop</p>
      </div>
    );
  }

  return (
    <div className="animate-data-in space-y-3">
      <SectionLabel>
        <span>fee breakdown</span>
        <span className="ml-auto tabular-nums">
          {formatCurrencyFromMinorUnits(total, currency, locale)}
        </span>
      </SectionLabel>
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
                  <div className="flex flex-col gap-0.5">
                    <p className="text-xs font-medium">{entry.label}</p>
                    <p className="flex items-baseline gap-3 text-xs">
                      <span className="tabular-nums">
                        {formatCurrencyFromMinorUnits(entry.amount, currency, locale)}
                      </span>
                      <span className="text-muted-foreground tabular-nums">
                        {percentage.toFixed(1)}%
                      </span>
                    </p>
                  </div>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>
      <ul className="flex flex-wrap gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
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
}: {
  readonly data: ShopExpansionResponse;
  readonly shop: string;
  readonly filters: ExpenseFilters;
  readonly currency: Currency;
  readonly locale: string;
  readonly dateFormat: DateFormat;
}): ReactNode {
  return (
    <div
      className="animate-data-in space-y-3"
      style={{ "--data-in-delay": `${TOP_ORDERS_BASE_DELAY_MS}ms` } as CSSProperties}
    >
      <div className="flex min-w-0 items-baseline justify-between gap-4">
        <SectionLabel>top orders</SectionLabel>
        <Link
          to="/orders"
          search={{
            shop: [shop],
            payDateStart: filters.dateStart,
            payDateEnd: filters.dateEnd,
          }}
          className="group/link flex shrink-0 items-center gap-1 text-xs text-muted-foreground transition-colors duration-150 ease-out hover:text-foreground active:scale-[0.98]"
        >
          View all
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            className="size-3 shrink-0 transition-transform duration-150 ease-out group-hover/link:translate-x-0.5"
            aria-hidden
          />
        </Link>
      </div>
      {data.topOrders.length === 0 ? (
        <p className="text-sm text-muted-foreground text-pretty">No orders</p>
      ) : (
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
      )}
    </div>
  );
}

function ItemsPanel({
  data,
  shop,
  filters,
}: {
  readonly data: ShopExpansionResponse;
  readonly shop: string;
  readonly filters: ExpenseFilters;
}): ReactNode {
  return (
    <div
      className="animate-data-in space-y-3"
      style={{ "--data-in-delay": `${ITEMS_BASE_DELAY_MS}ms` } as CSSProperties}
    >
      <div className="flex min-w-0 items-baseline justify-between gap-4">
        <SectionLabel>collection items</SectionLabel>
        <Link
          to="/collection"
          search={{
            shop: [shop],
            payDateStart: filters.dateStart,
            payDateEnd: filters.dateEnd,
          }}
          className="group/link flex shrink-0 items-center gap-1 text-xs text-muted-foreground transition-colors duration-150 ease-out hover:text-foreground active:scale-[0.98]"
        >
          View all
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            className="size-3 shrink-0 transition-transform duration-150 ease-out group-hover/link:translate-x-0.5"
            aria-hidden
          />
        </Link>
      </div>
      {data.items.length === 0 ? (
        <p className="text-sm text-muted-foreground text-pretty">No collection items</p>
      ) : (
        <div className="flex flex-wrap gap-2">
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
      )}
    </div>
  );
}
