import { useCallback, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon, AddSquareIcon, MinusSignSquareIcon } from "@hugeicons/core-free-icons";
import {
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type { ColumnDef, ExpandedState, Row } from "@tanstack/react-table";
import type { Currency, DateFormat } from "@myakiba/contracts/shared/types";
import type {
  ExpenseFilters,
  ExpenseShopsFilters,
  ShopSpendRow,
  ShopExpansionFilters,
} from "@/queries/expenses";
import { DEFAULT_LIMIT } from "@myakiba/contracts/shared/constants";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { Button } from "@/components/ui/button";
import { DebouncedInput } from "@/components/debounced-input";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { ExpenseLedgerBand, ExpenseLedgerEmpty } from "@/components/expenses/expense-ledger";
import { ShopRowExpansion } from "@/components/expenses/shop-row-expansion";
import { Skeleton } from "@/components/ui/skeleton";
import { getShopsBreakdown } from "@/queries/expenses";
import { cn } from "@/lib/utils";

interface ShopsBreakdownSectionProps {
  readonly filters: ExpenseFilters;
  readonly setFilters: (filters: ExpenseFilters) => void;
  readonly currency: Currency;
  readonly locale: string;
  readonly dateFormat: DateFormat;
}

const ROW_NUMBER_COLUMN_ID = "__rowNumber";
const EXPAND_COLUMN_ID = "__expand";

export function ShopsBreakdownSection({
  filters,
  setFilters,
  currency,
  locale,
  dateFormat,
}: ShopsBreakdownSectionProps): ReactNode {
  const limit = filters.shopLimit ?? DEFAULT_LIMIT;
  const offset = filters.shopOffset ?? 0;
  const search = filters.shopSearch ?? "";
  const queryFilters = useMemo(
    (): ExpenseShopsFilters => ({
      dateStart: filters.dateStart,
      dateEnd: filters.dateEnd,
      status: filters.status,
      shop: filters.shop,
      search: filters.shopSearch,
      limit: filters.shopLimit,
      offset: filters.shopOffset,
    }),
    [filters],
  );
  const expansionFilters = useMemo(
    (): ShopExpansionFilters => ({
      dateStart: filters.dateStart,
      dateEnd: filters.dateEnd,
      status: filters.status,
    }),
    [filters],
  );
  const [expanded, setExpanded] = useState<ExpandedState>(() =>
    filters.expand ? { [filters.expand]: true } : {},
  );

  const { data, isPending, isError, error, isFetching } = useQuery({
    queryKey: ["expenses", "shops", queryFilters],
    queryFn: () => getShopsBreakdown(queryFilters),
    staleTime: 1000 * 60 * 5,
    retry: false,
    placeholderData: keepPreviousData,
  });

  const handleSearchChange = useCallback(
    (value: string | number): void => {
      setFilters({ ...filters, shopSearch: String(value) || undefined, shopOffset: 0 });
    },
    [filters, setFilters],
  );

  const shopSearchInput = (
    <div className="relative w-full sm:w-64">
      <HugeiconsIcon
        icon={Search01Icon}
        className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <DebouncedInput
        value={search}
        onChange={handleSearchChange}
        placeholder="Search shops..."
        className="pl-8 text-sm"
        debounce={300}
      />
    </div>
  );

  let panelContent: ReactNode = null;
  if (isPending) {
    panelContent = (
      <div className="space-y-3">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  } else if (isError) {
    panelContent = (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-destructive">Error: {error.message}</p>
      </div>
    );
  } else if (data) {
    panelContent = (
      <>
        <ShopsTable
          rows={data.rows}
          expanded={expanded}
          onExpandedChange={setExpanded}
          expansionFilters={expansionFilters}
          currency={currency}
          locale={locale}
          dateFormat={dateFormat}
          offset={offset}
          isLoading={isFetching}
        />
        <div className="flex items-center justify-between gap-3 pt-1">
          {data.totalCount > 0 ? (
            <p className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
              Showing {offset + 1}-{Math.min(offset + limit, data.totalCount)} of {data.totalCount}
            </p>
          ) : null}
          <TablePagination
            totalCount={data.totalCount}
            limit={limit}
            offset={offset}
            onOffsetChange={(shopOffset) => setFilters({ ...filters, shopOffset })}
          />
        </div>
      </>
    );
  }

  return (
    <section className="border-t border-border">
      <ExpenseLedgerBand
        title="shops you've purchased from"
        leading
        headerAction={shopSearchInput}
        className="space-y-3"
      >
        {panelContent}
      </ExpenseLedgerBand>
    </section>
  );
}

interface ShopsTableProps {
  readonly rows: readonly ShopSpendRow[];
  readonly expanded: ExpandedState;
  readonly onExpandedChange: React.Dispatch<React.SetStateAction<ExpandedState>>;
  readonly expansionFilters: ShopExpansionFilters;
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
  expansionFilters,
  currency,
  locale,
  dateFormat,
  offset,
  isLoading,
}: ShopsTableProps): ReactNode {
  const data = useMemo(() => [...rows], [rows]);
  const money = useCallback(
    (value: number): string => formatCurrencyFromMinorUnits(value, currency, locale),
    [currency, locale],
  );

  const columns = useMemo<ColumnDef<ShopSpendRow>[]>(
    () => [
      {
        id: EXPAND_COLUMN_ID,
        header: "",
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={(event) => {
              event.stopPropagation();
              row.toggleExpanded();
            }}
            aria-label={row.getIsExpanded() ? "Collapse row" : "Expand row"}
            aria-expanded={row.getIsExpanded()}
          >
            <HugeiconsIcon
              icon={row.getIsExpanded() ? MinusSignSquareIcon : AddSquareIcon}
              className="size-3.5 text-muted-foreground transition-transform duration-200 ease-out"
            />
          </Button>
        ),
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
        id: "orderCount",
        accessorFn: (row) => row.orderCount,
        header: "orders",
        cell: ({ getValue }) => getValue() ?? 0,
        size: 64,
      },
      {
        id: "itemCount",
        accessorFn: (row) => row.itemCount,
        header: "items",
        cell: ({ getValue }) => getValue() ?? 0,
        size: 64,
      },
      {
        id: "itemSpend",
        accessorFn: (row) => row.itemSpend,
        header: "item spend",
        cell: ({ getValue }) => money(Number(getValue())),
        size: 100,
      },
      {
        id: "feeSpend",
        accessorFn: (row) => row.feeSpend,
        header: "fee spend",
        cell: ({ getValue }) => money(Number(getValue())),
        size: 100,
      },
      {
        id: "totalSpend",
        accessorFn: (row) => row.totalSpend,
        header: "total",
        cell: ({ getValue }) => money(Number(getValue())),
        size: 100,
      },
      {
        id: "avgOrder",
        accessorFn: (row) => row.avgOrder,
        header: "avg order",
        cell: ({ getValue }) => money(Number(getValue())),
        size: 100,
      },
    ],
    [money, offset],
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

  if (rows.length === 0) {
    return (
      <ExpenseLedgerEmpty className="py-12">
        <p className="text-sm">No shops found</p>
        <p className="mt-1 text-xs">Try adjusting your search or filters</p>
      </ExpenseLedgerEmpty>
    );
  }

  return (
    <div className={cn("transition-opacity duration-150", isLoading && "opacity-60")}>
      <table className="w-full border-collapse text-xs">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className="border-b border-border/60 p-1.5 text-left font-medium text-muted-foreground"
                  style={{ width: header.column.getSize() }}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              row={row}
              expansionFilters={expansionFilters}
              currency={currency}
              locale={locale}
              dateFormat={dateFormat}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TableRow({
  row,
  expansionFilters,
  currency,
  locale,
  dateFormat,
}: {
  readonly row: Row<ShopSpendRow>;
  readonly expansionFilters: ShopExpansionFilters;
  readonly currency: Currency;
  readonly locale: string;
  readonly dateFormat: DateFormat;
}): ReactNode {
  const isExpanded = row.getIsExpanded();
  const colSpan = row.getVisibleCells().length;

  return (
    <>
      <tr
        onClick={() => row.toggleExpanded()}
        className="animate-data-in cursor-pointer border-b border-border/50 transition-colors duration-150 ease-out hover:bg-muted/40"
        style={{ "--data-in-delay": `${row.index * 20}ms` } as CSSProperties}
      >
        {row.getVisibleCells().map((cell) => (
          <td
            key={cell.id}
            className={cn(
              "p-1.5",
              cell.column.id === ROW_NUMBER_COLUMN_ID && "text-muted-foreground",
              cell.column.id === EXPAND_COLUMN_ID && "w-8",
              ["itemSpend", "feeSpend", "totalSpend", "avgOrder"].includes(cell.column.id) &&
                "tabular-nums",
            )}
          >
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </td>
        ))}
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={colSpan} className="p-0">
            <ShopRowExpansion
              shop={row.original.shop}
              filters={expansionFilters}
              currency={currency}
              locale={locale}
              dateFormat={dateFormat}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function TablePagination({
  totalCount,
  limit,
  offset,
  onOffsetChange,
}: {
  readonly totalCount: number;
  readonly limit: number;
  readonly offset: number;
  readonly onOffsetChange: (offset: number) => void;
}): ReactNode {
  const totalPages = Math.ceil(totalCount / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  if (totalPages <= 1) {
    return null;
  }

  const goToPage = (page: number, event: React.MouseEvent): void => {
    event.preventDefault();
    onOffsetChange((page - 1) * limit);
  };

  const pageNumbers: (number | "ellipsis")[] = [];
  const maxVisible = 5;
  if (totalPages <= maxVisible) {
    for (let page = 1; page <= totalPages; page++) pageNumbers.push(page);
  } else {
    pageNumbers.push(1);
    if (currentPage > 3) pageNumbers.push("ellipsis");
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);
    for (let page = start; page <= end; page++) pageNumbers.push(page);
    if (currentPage < totalPages - 2) pageNumbers.push("ellipsis");
    pageNumbers.push(totalPages);
  }

  return (
    <Pagination className="mx-0 w-auto">
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            href="#"
            onClick={(event) => goToPage(currentPage - 1, event)}
            className={cn(
              "cursor-pointer transition-colors active:scale-[0.97]",
              currentPage === 1 && "pointer-events-none opacity-50",
            )}
            aria-disabled={currentPage === 1}
            text="Prev"
          />
        </PaginationItem>
        {pageNumbers.map((page, idx) =>
          page === "ellipsis" ? (
            <PaginationItem key={`ellipsis-${idx}`}>
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={page}>
              <PaginationLink
                href="#"
                onClick={(event) => goToPage(page, event)}
                isActive={page === currentPage}
                className="cursor-pointer transition-colors active:scale-[0.97]"
              >
                {page}
              </PaginationLink>
            </PaginationItem>
          ),
        )}
        <PaginationItem>
          <PaginationNext
            href="#"
            onClick={(event) => goToPage(currentPage + 1, event)}
            className={cn(
              "cursor-pointer transition-colors active:scale-[0.97]",
              currentPage === totalPages && "pointer-events-none opacity-50",
            )}
            aria-disabled={currentPage === totalPages}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
