import { useCallback, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { AddSquareIcon, MinusSignSquareIcon, Search01Icon } from "@hugeicons/core-free-icons";
import { getCoreRowModel, getExpandedRowModel, useReactTable } from "@tanstack/react-table";
import type { ColumnDef, ExpandedState, Row } from "@tanstack/react-table";
import type {
  ExpenseFilters,
  ExpenseScope,
  ExpenseShopFilters,
  ExpenseShopRow,
} from "@myakiba/contracts/expenses/schema";
import type { Currency, DateFormat } from "@myakiba/contracts/shared/types";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import * as DataTable from "@/components/data-table/data-table";
import { DataTablePagination } from "@/components/data-table/data-table-pagination";
import { DebouncedInput } from "@/components/debounced-input";
import { ExpensePanel } from "@/components/expenses/dashboard-shell";
import { ShopTableRowExpansion } from "@/components/expenses/shop-table-row-expansion";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getExpensesShops } from "@/queries/expenses";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 10;
const ROW_NUMBER_COLUMN_ID = "__rowNumber";
const EXPAND_COLUMN_ID = "__expand";
const TABULAR_COLUMN_IDS = new Set([
  "spend",
  "share",
  "itemCount",
  "averageItemCost",
  "orderCount",
  "averageOrder",
  "orderItemCount",
  "fees",
  "averageShipping",
]);

export function ShopTable({
  scope,
  filters,
  currency,
  locale,
  dateFormat,
}: {
  readonly scope: ExpenseScope;
  readonly filters: ExpenseFilters;
  readonly currency: Currency;
  readonly locale: string;
  readonly dateFormat: DateFormat;
}): ReactNode {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const paginationKey = JSON.stringify([
    scope,
    filters.dateStart,
    filters.dateEnd,
    filters.shop,
    search,
  ]);
  const [pagination, setPagination] = useState(() => ({ key: paginationKey, offset: 0 }));
  const offset = pagination.key === paginationKey ? pagination.offset : 0;
  const queryFilters = useMemo(
    (): ExpenseShopFilters => ({
      scope,
      dateStart: filters.dateStart,
      dateEnd: filters.dateEnd,
      shop: filters.shop,
      search: search || undefined,
      limit: PAGE_SIZE,
      offset,
    }),
    [filters.dateStart, filters.dateEnd, filters.shop, offset, scope, search],
  );
  const query = useQuery({
    queryKey: ["expenses", "shops", queryFilters],
    queryFn: () => getExpensesShops(queryFilters),
    staleTime: 1000 * 60 * 5,
    retry: false,
  });
  const rows = query.data?.rows ?? [];
  const totalCount = query.data?.totalCount ?? 0;
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
        }}
        placeholder="Search shops..."
        className="pl-8 text-sm"
        debounce={300}
      />
    </div>
  );
  let resultCount: ReactNode = null;
  if (query.isPending) {
    resultCount = <Skeleton className="h-3 w-28" />;
  } else if (totalCount > 0) {
    resultCount = (
      <p className="animate-data-in shrink-0 whitespace-nowrap text-xs text-muted-foreground">
        Showing {offset + 1}-{Math.min(offset + PAGE_SIZE, totalCount)} of {totalCount}
      </p>
    );
  }

  return (
    <ExpensePanel title="Shops" headerAction={shopSearchInput} className="min-w-0">
      {query.isError ? (
        <div className="flex h-64 items-center justify-center">
          <p className="text-sm text-destructive">Error: {query.error.message}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4" aria-busy={query.isPending}>
          <ShopsTable
            scope={scope}
            rows={rows}
            expanded={expanded}
            onExpandedChange={setExpanded}
            filters={filters}
            currency={currency}
            locale={locale}
            dateFormat={dateFormat}
            offset={offset}
            isPending={query.isPending}
            isFetching={query.isFetching}
          />
          <div className="flex items-center justify-between gap-3 pt-1">
            {resultCount}
            {query.isPending ? null : (
              <div className="animate-data-in">
                <DataTablePagination
                  totalCount={totalCount}
                  limit={PAGE_SIZE}
                  offset={offset}
                  onOffsetChange={(nextOffset) =>
                    setPagination({ key: paginationKey, offset: nextOffset })
                  }
                />
              </div>
            )}
          </div>
        </div>
      )}
    </ExpensePanel>
  );
}

function ShopsTable({
  scope,
  rows,
  expanded,
  onExpandedChange,
  filters,
  currency,
  locale,
  dateFormat,
  offset,
  isPending,
  isFetching,
}: {
  readonly scope: ExpenseScope;
  readonly rows: readonly ExpenseShopRow[];
  readonly expanded: ExpandedState;
  readonly onExpandedChange: React.Dispatch<React.SetStateAction<ExpandedState>>;
  readonly filters: ExpenseFilters;
  readonly currency: Currency;
  readonly locale: string;
  readonly dateFormat: DateFormat;
  readonly offset: number;
  readonly isPending: boolean;
  readonly isFetching: boolean;
}): ReactNode {
  const data = useMemo(() => [...rows], [rows]);
  const formatCurrency = useCallback(
    (value: number) => formatCurrencyFromMinorUnits(value, currency, locale),
    [currency, locale],
  );
  const columns = useMemo<ColumnDef<ExpenseShopRow>[]>(
    () => getColumns({ scope, offset, formatCurrency }),
    [formatCurrency, offset, scope],
  );
  const table = useReactTable({
    data,
    columns,
    state: { expanded },
    onExpandedChange,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getRowId: (row) => row.id,
    getRowCanExpand: () => true,
  });

  return (
    <DataTable.Root
      table={table}
      isLoading={isPending}
      skeletonRowCount={PAGE_SIZE}
      empty={
        <DataTable.Empty
          title="No shops found"
          description="Try adjusting your search or filters"
        />
      }
    >
      <DataTable.LoadingSurface
        className={cn(
          "overflow-x-auto transition-opacity duration-200",
          isFetching && !isPending && "opacity-60",
        )}
      >
        <DataTable.Table className={scope === "orders" ? "min-w-210" : "min-w-150"}>
          <DataTable.Header useColumnSizing />
          <DataTable.Body
            onRowClick={(row) => row.toggleExpanded()}
            renderExpandedRow={(row: Row<ExpenseShopRow>) => (
              <ShopTableRowExpansion
                row={row.original}
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

function getColumns({
  scope,
  offset,
  formatCurrency,
}: {
  scope: ExpenseScope;
  offset: number;
  formatCurrency: (value: number) => string;
}): ColumnDef<ExpenseShopRow>[] {
  const columns: ColumnDef<ExpenseShopRow>[] = [
    { id: EXPAND_COLUMN_ID, header: "", cell: ({ row }) => <ExpandButton row={row} />, size: 32 },
    { id: ROW_NUMBER_COLUMN_ID, header: "#", cell: ({ row }) => offset + row.index + 1, size: 40 },
    { id: "shop", accessorFn: (row) => row.shop || "Unassigned", header: "Shop" },
    {
      id: "spend",
      accessorFn: (row) => row.spend,
      header: "Spend",
      cell: ({ getValue }) => formatCurrency(Number(getValue())),
      size: 96,
    },
    {
      id: "share",
      accessorFn: (row) => row.share,
      header: "Share",
      cell: ({ getValue }) => `${Number(getValue()).toFixed(1)}%`,
      size: 72,
    },
  ];

  if (scope === "collection") {
    columns.push(
      {
        id: "itemCount",
        accessorFn: (row) => (row.scope === "collection" ? row.itemCount : 0),
        header: "Items",
        size: 64,
      },
      {
        id: "averageItemCost",
        accessorFn: (row) => (row.scope === "collection" ? row.averageItemCost : 0),
        header: "Average Item Cost",
        cell: ({ getValue }) => formatCurrency(Number(getValue())),
        size: 120,
      },
    );
  } else if (scope === "orders") {
    columns.push(
      {
        id: "orderCount",
        accessorFn: (row) => (row.scope === "orders" ? row.orderCount : 0),
        header: "Orders",
        size: 64,
      },
      {
        id: "averageOrder",
        accessorFn: (row) => (row.scope === "orders" ? row.averageOrder : 0),
        header: "Average Order",
        cell: ({ getValue }) => formatCurrency(Number(getValue())),
        size: 104,
      },
      {
        id: "orderItemCount",
        accessorFn: (row) => (row.scope === "orders" ? row.orderItemCount : 0),
        header: "Order Items",
        size: 88,
      },
      {
        id: "fees",
        accessorFn: (row) => (row.scope === "orders" ? row.fees : 0),
        header: "Fees",
        cell: ({ getValue }) => formatCurrency(Number(getValue())),
        size: 88,
      },
    );
  } else {
    columns.push(
      {
        id: "orderCount",
        accessorFn: (row) => (row.scope === "shipping" ? row.orderCount : 0),
        header: "Orders",
        size: 64,
      },
      {
        id: "averageShipping",
        accessorFn: (row) => (row.scope === "shipping" ? row.averageShipping : 0),
        header: "Average Shipping",
        cell: ({ getValue }) => formatCurrency(Number(getValue())),
        size: 120,
      },
    );
  }

  return columns;
}

function ExpandButton({ row }: { readonly row: Row<ExpenseShopRow> }): ReactNode {
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
