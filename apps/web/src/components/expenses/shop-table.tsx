import { useCallback, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { AddSquareIcon, MinusSignSquareIcon, Search01Icon } from "@hugeicons/core-free-icons";
import { getCoreRowModel, getExpandedRowModel, useReactTable } from "@tanstack/react-table";
import type { ColumnDef, ExpandedState, Row } from "@tanstack/react-table";
import type {
  ExpenseFilters,
  ExpenseShopFilters,
  ShopSpendRow,
} from "@myakiba/contracts/expenses/schema";
import type { Currency, DateFormat } from "@myakiba/contracts/shared/types";
import { DEFAULT_LIMIT } from "@myakiba/contracts/shared/constants";
import { DataTable } from "@/components/data-table/data-table";
import { DataTablePagination } from "@/components/data-table/data-table-pagination";
import { DebouncedInput } from "@/components/debounced-input";
import { Section } from "@/components/expenses/section";
import { ShopTableRowExpansion } from "@/components/expenses/shop-table-row-expansion";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { Button } from "@/components/ui/button";
import { getExpensesShops } from "@/queries/expenses";
import { cn } from "@/lib/utils";

interface ShopTableProps {
  readonly filters: ExpenseFilters;
  readonly currency: Currency;
  readonly locale: string;
  readonly dateFormat: DateFormat;
}

const ROW_NUMBER_COLUMN_ID = "__rowNumber";
const EXPAND_COLUMN_ID = "__expand";
const TABULAR_COLUMN_IDS = new Set([
  "collectionItemSpend",
  "orderItemSpend",
  "feeSpend",
  "totalSpend",
  "averageOrderSpend",
  "averageCollectionItemSpend",
  "averageOrderItemSpend",
  "averageFeeSpend",
  "orderCount",
  "ownedItemCount",
  "orderItemCount",
]);

export function ShopTable({ filters, currency, locale, dateFormat }: ShopTableProps): ReactNode {
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const limit = DEFAULT_LIMIT;
  const queryFilters = useMemo(
    (): ExpenseShopFilters => ({
      dateStart: filters.dateStart,
      dateEnd: filters.dateEnd,
      shop: filters.shop,
      search: search || undefined,
      limit,
      offset,
    }),
    [filters.dateStart, filters.dateEnd, filters.shop, limit, offset, search],
  );
  const query = useQuery({
    queryKey: ["expenses", "shops", queryFilters],
    queryFn: () => getExpensesShops(queryFilters),
    staleTime: 1000 * 60 * 5,
    retry: false,
  });
  const data = query.data;
  const pending = query.isPending;
  const fetching = query.isFetching;
  const isLoading = pending || fetching;
  const totalCount = data?.totalCount ?? 0;
  const shopSearchInput = (
    <div className="relative w-full sm:w-64">
      <HugeiconsIcon
        icon={Search01Icon}
        className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <DebouncedInput
        value={search}
        onChange={(value) => {
          setSearch(String(value));
          setOffset(0);
        }}
        placeholder="Search shops..."
        className="pl-8 text-sm"
        debounce={300}
      />
    </div>
  );

  return (
    <Section title="shops" isLoading={pending} chartSkeleton headerAction={shopSearchInput}>
      {query.isError ? (
        <div className="flex h-64 items-center justify-center">
          <p className="text-sm text-destructive">Error: {query.error.message}</p>
        </div>
      ) : null}
      {!query.isError && data !== undefined ? (
        <div className="animate-data-in flex flex-col gap-4 [--data-in-delay:60ms]">
          <ShopsTable
            rows={data.rows}
            expanded={expanded}
            onExpandedChange={setExpanded}
            filters={filters}
            currency={currency}
            locale={locale}
            dateFormat={dateFormat}
            offset={offset}
            isLoading={isLoading}
          />
          <div className="animate-data-in flex items-center justify-between gap-3 pt-1 [--data-in-delay:120ms]">
            {totalCount > 0 ? (
              <p className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                Showing {offset + 1}-{Math.min(offset + limit, totalCount)} of {totalCount}
              </p>
            ) : null}
            <DataTablePagination
              totalCount={totalCount}
              limit={limit}
              offset={offset}
              onOffsetChange={setOffset}
            />
          </div>
        </div>
      ) : null}
    </Section>
  );
}

interface ShopsTableProps {
  readonly rows: readonly ShopSpendRow[];
  readonly expanded: ExpandedState;
  readonly onExpandedChange: React.Dispatch<React.SetStateAction<ExpandedState>>;
  readonly filters: ExpenseFilters;
  readonly currency: Currency;
  readonly locale: string;
  readonly dateFormat: DateFormat;
  readonly offset: number;
  readonly isLoading: boolean;
}

function ShopsTable({
  rows,
  expanded,
  onExpandedChange,
  filters,
  currency,
  locale,
  dateFormat,
  offset,
  isLoading,
}: ShopsTableProps): ReactNode {
  const data = useMemo(() => [...rows], [rows]);
  const formatCurrency = useCallback(
    (value: number) => formatCurrencyFromMinorUnits(value, currency, locale),
    [currency, locale],
  );

  const columns = useMemo<ColumnDef<ShopSpendRow>[]>(
    () => [
      {
        id: EXPAND_COLUMN_ID,
        header: "",
        cell: ({ row }) => <ExpandButton row={row} />,
        size: 32,
      },
      {
        id: ROW_NUMBER_COLUMN_ID,
        header: "#",
        cell: ({ row }) => offset + row.index + 1,
        size: 40,
      },
      {
        id: "shop",
        accessorFn: (row) => row.shop,
        header: "shop",
        cell: ({ getValue }) => getValue() ?? "-",
      },
      {
        id: "totalSpend",
        accessorFn: (row) => row.totalSpend,
        header: "total",
        cell: ({ getValue }) => formatCurrency(Number(getValue())),
        size: 88,
      },
      {
        id: "orderCount",
        accessorFn: (row) => row.orderCount,
        header: "orders",
        cell: ({ getValue }) => getValue() ?? 0,
        size: 64,
      },
      {
        id: "averageOrderSpend",
        accessorFn: (row) => row.averageOrderSpend,
        header: "order avg",
        cell: ({ getValue }) => formatCurrency(Number(getValue())),
        size: 88,
      },
      {
        id: "orderItemCount",
        accessorFn: (row) => row.orderItemCount,
        header: "order items",
        cell: ({ getValue }) => getValue() ?? 0,
        size: 80,
      },
      {
        id: "orderItemSpend",
        accessorFn: (row) => row.orderItemSpend,
        header: "order item spend",
        cell: ({ getValue }) => formatCurrency(Number(getValue())),
        size: 112,
      },
      {
        id: "averageOrderItemSpend",
        accessorFn: (row) => row.averageOrderItemSpend,
        header: "order item avg",
        cell: ({ getValue }) => formatCurrency(Number(getValue())),
        size: 104,
      },
      {
        id: "feeSpend",
        accessorFn: (row) => row.feeSpend,
        header: "fees",
        cell: ({ getValue }) => formatCurrency(Number(getValue())),
        size: 88,
      },
      {
        id: "averageFeeSpend",
        accessorFn: (row) => row.averageFeeSpend,
        header: "fee avg",
        cell: ({ getValue }) => formatCurrency(Number(getValue())),
        size: 80,
      },
      {
        id: "ownedItemCount",
        accessorFn: (row) => row.ownedItemCount,
        header: "collection items",
        cell: ({ getValue }) => getValue() ?? 0,
        size: 88,
      },
      {
        id: "collectionItemSpend",
        accessorFn: (row) => row.collectionItemSpend,
        header: "collection item spend",
        cell: ({ getValue }) => formatCurrency(Number(getValue())),
        size: 120,
      },
      {
        id: "averageCollectionItemSpend",
        accessorFn: (row) => row.averageCollectionItemSpend,
        header: "collection item avg",
        cell: ({ getValue }) => formatCurrency(Number(getValue())),
        size: 120,
      },
    ],
    [formatCurrency, offset],
  );

  const table = useReactTable({
    data,
    columns,
    state: { expanded },
    onExpandedChange,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getRowId: (row) => row.shop,
    getRowCanExpand: () => true,
  });

  return (
    <DataTable.Root
      table={table}
      isLoading={isLoading}
      empty={
        <DataTable.Empty
          title="No shops found"
          description="Try adjusting your search or filters"
        />
      }
    >
      <DataTable.LoadingSurface className="overflow-x-auto">
        <DataTable.Table className="min-w-280">
          <DataTable.Header useColumnSizing />
          <DataTable.Body
            onRowClick={(row) => row.toggleExpanded()}
            renderExpandedRow={(row: Row<ShopSpendRow>) => (
              <ShopTableRowExpansion
                shop={row.original.shop}
                filters={filters}
                currency={currency}
                locale={locale}
                dateFormat={dateFormat}
              />
            )}
            getCellClassName={(_, columnId) =>
              cn(
                columnId === ROW_NUMBER_COLUMN_ID && "text-muted-foreground",
                columnId === EXPAND_COLUMN_ID && "w-8",
                TABULAR_COLUMN_IDS.has(columnId) && "tabular-nums",
              )
            }
          />
        </DataTable.Table>
      </DataTable.LoadingSurface>
    </DataTable.Root>
  );
}

function ExpandButton({ row }: { readonly row: Row<ShopSpendRow> }): ReactNode {
  const isExpanded = row.getIsExpanded();

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={(event) => {
        event.stopPropagation();
        row.toggleExpanded();
      }}
      aria-label={isExpanded ? "Collapse row" : "Expand row"}
      aria-expanded={isExpanded}
    >
      <HugeiconsIcon
        icon={isExpanded ? MinusSignSquareIcon : AddSquareIcon}
        className="size-3.5 text-muted-foreground transition-transform duration-200 ease-out"
      />
    </Button>
  );
}
