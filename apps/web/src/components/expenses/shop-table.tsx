import { useCallback, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useRead } from "@/data/client";
import { expenses, shopTableInput } from "@/data/resources/expenses";
import { getCoreRowModel, getExpandedRowModel, useReactTable } from "@tanstack/react-table";
import type { ColumnDef, ExpandedState } from "@tanstack/react-table";
import type {
  ExpenseFilters,
  ExpenseScope,
  ExpenseShopRow,
} from "@myakiba/contracts/expenses/schema";
import type { Currency, DateFormat } from "@myakiba/contracts/shared/types";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import {
  DataTable,
  DataTableEmpty,
  DATA_TABLE_NUMBER_META,
  DATA_TABLE_SKELETON,
} from "@/components/data-table/data-table";
import { RowExpandButton, ROW_EXPAND_SKELETON } from "@/components/data-table/row-expand-button";
import { ExpensePanel } from "@/components/expenses/dashboard-shell";
import { ShopTableRowExpansion } from "@/components/expenses/shop-table-row-expansion";
import { cn } from "@/lib/utils";
import { shownMessageOf } from "@/data/api";

const ROW_NUMBER_COLUMN_ID = "__rowNumber";
const EXPAND_COLUMN_ID = "__expand";

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
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const { dateStart, dateEnd, shop } = filters;
  const queryFilters = useMemo(
    () => shopTableInput(scope, { dateStart, dateEnd, shop }),
    [dateStart, dateEnd, shop, scope],
  );
  const query = useRead(expenses.shops, queryFilters);
  const rows = query.data?.items ?? [];

  return (
    <ExpensePanel title="Shops" className="min-w-0">
      {query.isError ? (
        <div className="flex h-64 items-center justify-center">
          <p className="text-sm text-destructive">Error: {shownMessageOf(query.error)}</p>
        </div>
      ) : (
        <div aria-busy={query.isPending}>
          <ShopsTable
            scope={scope}
            rows={rows}
            expanded={expanded}
            onExpandedChange={setExpanded}
            filters={filters}
            currency={currency}
            locale={locale}
            dateFormat={dateFormat}
            isPending={query.isPending}
            isFetching={query.isFetching}
          />
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
  readonly isPending: boolean;
  readonly isFetching: boolean;
}): ReactNode {
  const data = useMemo(() => [...rows], [rows]);
  const formatCurrency = useCallback(
    (value: number) => formatCurrencyFromMinorUnits(value, currency, locale),
    [currency, locale],
  );
  const columns = useMemo<ColumnDef<ExpenseShopRow>[]>(
    () => getColumns({ scope, formatCurrency }),
    [formatCurrency, scope],
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
    <DataTable
      table={table}
      isLoading={isPending}
      empty={<DataTableEmpty title="No shops found" />}
      variant="sized"
      className={cn(
        "overflow-x-auto overflow-y-hidden transition-opacity duration-200",
        isFetching && !isPending && "opacity-60",
      )}
      tableClassName={scope === "orders" ? "min-w-210" : "min-w-150"}
      onRowClick={(row) => row.toggleExpanded()}
      renderExpandedRow={(row) => (
        <ShopTableRowExpansion
          row={row.original}
          filters={filters}
          currency={currency}
          locale={locale}
          dateFormat={dateFormat}
        />
      )}
      getCellClassName={(_, columnId) =>
        columnId === ROW_NUMBER_COLUMN_ID ? "text-muted-foreground" : undefined
      }
    />
  );
}

function getColumns({
  scope,
  formatCurrency,
}: {
  scope: ExpenseScope;
  formatCurrency: (value: number) => string;
}): ColumnDef<ExpenseShopRow>[] {
  const columns: ColumnDef<ExpenseShopRow>[] = [
    {
      id: EXPAND_COLUMN_ID,
      header: "",
      cell: ({ row }) => <RowExpandButton row={row} />,
      size: 40,
      meta: { skeleton: ROW_EXPAND_SKELETON },
    },
    {
      id: ROW_NUMBER_COLUMN_ID,
      header: "#",
      cell: ({ row }) => row.index + 1,
      size: 40,
      meta: { skeleton: DATA_TABLE_SKELETON.rank },
    },
    { id: "shop", accessorFn: (row) => row.shop || "Unassigned", header: "Shop", size: 150 },
    {
      id: "spend",
      accessorFn: (row) => row.spend,
      header: "Spend",
      cell: ({ getValue }) => formatCurrency(Number(getValue())),
      size: 96,
      meta: { ...DATA_TABLE_NUMBER_META, skeleton: DATA_TABLE_SKELETON.money },
    },
    {
      id: "share",
      accessorFn: (row) => row.share,
      header: "Share",
      cell: ({ getValue }) => `${Number(getValue()).toFixed(1)}%`,
      size: 72,
      meta: { ...DATA_TABLE_NUMBER_META, skeleton: DATA_TABLE_SKELETON.percent },
    },
  ];

  if (scope === "collection") {
    columns.push(
      {
        id: "itemCount",
        accessorFn: (row) => (row.scope === "collection" ? row.itemCount : 0),
        header: "Items",
        size: 64,
        meta: { ...DATA_TABLE_NUMBER_META, skeleton: DATA_TABLE_SKELETON.count },
      },
      {
        id: "averageItemCost",
        accessorFn: (row) => (row.scope === "collection" ? row.averageItemCost : 0),
        header: "Average Item Cost",
        cell: ({ getValue }) => formatCurrency(Number(getValue())),
        size: 120,
        meta: { ...DATA_TABLE_NUMBER_META, skeleton: DATA_TABLE_SKELETON.money },
      },
    );
  } else if (scope === "orders") {
    columns.push(
      {
        id: "orderCount",
        accessorFn: (row) => (row.scope === "orders" ? row.orderCount : 0),
        header: "Orders",
        size: 64,
        meta: { ...DATA_TABLE_NUMBER_META, skeleton: DATA_TABLE_SKELETON.count },
      },
      {
        id: "averageOrder",
        accessorFn: (row) => (row.scope === "orders" ? row.averageOrder : 0),
        header: "Average Order",
        cell: ({ getValue }) => formatCurrency(Number(getValue())),
        size: 104,
        meta: { ...DATA_TABLE_NUMBER_META, skeleton: DATA_TABLE_SKELETON.money },
      },
      {
        id: "orderItemCount",
        accessorFn: (row) => (row.scope === "orders" ? row.orderItemCount : 0),
        header: "Order Items",
        size: 88,
        meta: { ...DATA_TABLE_NUMBER_META, skeleton: DATA_TABLE_SKELETON.count },
      },
      {
        id: "fees",
        accessorFn: (row) => (row.scope === "orders" ? row.fees : 0),
        header: "Fees",
        cell: ({ getValue }) => formatCurrency(Number(getValue())),
        size: 88,
        meta: { ...DATA_TABLE_NUMBER_META, skeleton: DATA_TABLE_SKELETON.money },
      },
    );
  } else {
    columns.push(
      {
        id: "orderCount",
        accessorFn: (row) => (row.scope === "shipping" ? row.orderCount : 0),
        header: "Orders",
        size: 64,
        meta: { ...DATA_TABLE_NUMBER_META, skeleton: DATA_TABLE_SKELETON.count },
      },
      {
        id: "averageShipping",
        accessorFn: (row) => (row.scope === "shipping" ? row.averageShipping : 0),
        header: "Average Shipping",
        cell: ({ getValue }) => formatCurrency(Number(getValue())),
        size: 120,
        meta: { ...DATA_TABLE_NUMBER_META, skeleton: DATA_TABLE_SKELETON.money },
      },
    );
  }

  return columns;
}
