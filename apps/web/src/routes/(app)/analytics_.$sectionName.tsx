import { useCallback, useMemo, useState, type ReactNode } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  ANALYTICS_SECTIONS,
  DEFAULT_LIMIT,
  ENTRY_CATEGORIES,
} from "@myakiba/contracts/shared/constants";
import type { AnalyticsSection } from "@myakiba/contracts/shared/types";
import { SECTION_GRADIENT_COLORS } from "@/components/analytics/section";
import { z } from "zod";
import { Search01Icon, AddSquareIcon, MinusSignSquareIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  useReactTable,
  type ColumnDef,
  type ExpandedState,
  type Row,
} from "@tanstack/react-table";
import Loader from "@/components/loader";
import {
  getAnalyticsSection,
  getAnalyticsSectionItems,
  type AnalyticsSectionRow,
} from "@/queries/analytics";
import type React from "react";
import { DebouncedInput } from "@/components/debounced-input";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from "@/components/ui/pagination";
import { Button } from "@/components/ui/button";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import { useFilters } from "@/hooks/use-filters";
import { cn } from "@/lib/utils";
import { BackLink } from "@/components/ui/back-link";

const analyticsSectionSchema = z.enum(ANALYTICS_SECTIONS);

const sectionSearchSchema = z.object({
  search: z.string().optional(),
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const SECTION_LABELS: Record<string, string> = {
  classifications: "Classifications",
  origins: "Origins",
  characters: "Characters",
  companies: "Companies",
  artists: "Artists",
  materials: "Materials",
  events: "Events",
  shops: "Shops",
  scales: "Scales",
};

const SECTION_DISPLAY_ORDER = [
  ...ENTRY_CATEGORIES.map((c) => c.toLowerCase()),
  "shops",
  "scales",
] as const;

const SECTION_GRADIENTS: Record<string, string> = Object.fromEntries(
  SECTION_DISPLAY_ORDER.map((section, idx) => [
    section,
    SECTION_GRADIENT_COLORS[idx % SECTION_GRADIENT_COLORS.length],
  ]),
);

const SECTION_ITEM_PAGE_SIZE = 6;

export const Route = createFileRoute("/(app)/analytics_/$sectionName")({
  validateSearch: sectionSearchSchema,
  beforeLoad: ({ params }) => {
    const sectionNameResult = analyticsSectionSchema.safeParse(params.sectionName);

    if (!sectionNameResult.success) {
      throw notFound();
    }
  },
  component: RouteComponent,
  head: ({ params }) => ({
    meta: [
      {
        name: "description",
        content: `Analytics for ${params.sectionName}`,
      },
      {
        title: `${SECTION_LABELS[params.sectionName] ?? params.sectionName} Analytics - myakiba`,
      },
    ],
  }),
});

function RouteComponent(): ReactNode {
  const sectionName = analyticsSectionSchema.parse(Route.useParams().sectionName);
  const { currency, locale } = useUserPreferences();
  const { filters, setFilters } = useFilters("/(app)/analytics_/$sectionName", {
    paginationDefaults: { limit: DEFAULT_LIMIT },
  });

  const limit = filters.limit ?? DEFAULT_LIMIT;
  const offset = filters.offset ?? 0;
  const search = filters.search ?? "";

  const { data, isPending, isError, error, isFetching } = useQuery({
    queryKey: ["analytics", "section", sectionName, { search, limit, offset }],
    queryFn: () => getAnalyticsSection(sectionName, { search, limit, offset }),
    staleTime: 1000 * 60 * 5,
    retry: false,
    placeholderData: keepPreviousData,
  });

  const formatCell = useCallback(
    (column: string, value: string | number | null): string | number | null => {
      if (column === "totalSpent" && value !== null) {
        return formatCurrencyFromMinorUnits(Number(value), currency, locale);
      }

      return value;
    },
    [currency, locale],
  );

  const handleSearchChange = useCallback(
    (value: string | number) => {
      setFilters({ search: String(value) || undefined, offset: 0 });
    },
    [setFilters],
  );

  const sectionLabel = SECTION_LABELS[sectionName] ?? sectionName;
  const gradientColor = SECTION_GRADIENTS[sectionName] ?? "var(--color-blue-600)";

  return (
    <div className="flex flex-col gap-6 mx-auto max-w-4xl">
      <div className="flex flex-col gap-2 mb-2">
        <BackLink to="/analytics" text="Back" font="orbitron" />
        <h1 className="text-2xl font-orbitron font-medium lowercase">
          {sectionLabel}
          <span className="hidden sm:inline"> ⭑.ᐟ</span>
        </h1>
        <p className="text-muted-foreground text-sm">
          Detailed breakdown of {sectionLabel.toLowerCase()} in your collection.
        </p>
      </div>

      {isPending && <Loader className="h-64" />}

      {isError && (
        <div className="flex flex-col items-center justify-center h-64 gap-y-4">
          <div className="text-lg font-medium text-destructive">Error: {error.message}</div>
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-2">
            {[
              { label: "Unique", value: data.kpis.uniqueCount },
              { label: "Total Items", value: data.kpis.totalItemCount },
              {
                label: "Total Spent",
                value: formatCurrencyFromMinorUnits(data.kpis.totalSpent, currency, locale),
              },
              {
                label: "Avg. Spent",
                value: formatCurrencyFromMinorUnits(data.kpis.averageSpent, currency, locale),
              },
            ].map((kpi) => (
              <p
                key={kpi.label}
                className="animate-data-in text-md text-muted-foreground font-orbitron lowercase"
              >
                {kpi.label}: <span className="font-medium text-foreground">{kpi.value}</span>
              </p>
            ))}
          </div>

          <div className="animate-data-in relative overflow-hidden border rounded-lg p-4 space-y-4">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-10"
              style={{
                background: `radial-gradient(125% 125% at 50% 0%, transparent 40%, ${gradientColor} 60%, transparent 80%)`,
              }}
            />

            <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <h3 className="text-sm font-medium font-orbitron lowercase">All {sectionLabel}</h3>
              <div className="relative w-full sm:w-64">
                <HugeiconsIcon
                  icon={Search01Icon}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none"
                />
                <DebouncedInput
                  value={search}
                  onChange={handleSearchChange}
                  placeholder={`Search ${sectionLabel.toLowerCase()}...`}
                  className="pl-8 h-8 text-sm"
                  debounce={300}
                />
              </div>
            </div>

            <div className="relative">
              <SectionTable
                rows={data.rows}
                formatCell={formatCell}
                sectionName={sectionName}
                isLoading={isFetching && !isPending}
              />
            </div>

            <div className="relative flex items-center justify-between gap-3 pt-2">
              <p className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                Showing {offset + 1}–{Math.min(offset + limit, data.totalCount)} of{" "}
                {data.totalCount}
              </p>
              <TablePagination
                totalCount={data.totalCount}
                limit={limit}
                offset={offset}
                onOffsetChange={(newOffset) => setFilters({ offset: newOffset })}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const ROW_NUMBER_COLUMN_ID = "__rowNumber";
const EXPAND_COLUMN_ID = "__expand";

function SectionTable({
  rows,
  formatCell,
  sectionName,
  isLoading,
}: {
  readonly rows: readonly AnalyticsSectionRow[];
  readonly formatCell: (column: string, value: string | number | null) => string | number | null;
  readonly sectionName: AnalyticsSection;
  readonly isLoading: boolean;
}): ReactNode {
  const [expanded, setExpanded] = useState<ExpandedState>({});

  const tableData = useMemo(() => Array.from(rows), [rows]);

  const columns = useMemo<ColumnDef<AnalyticsSectionRow>[]>(
    () => [
      {
        id: EXPAND_COLUMN_ID,
        header: "",
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={(e) => {
              e.stopPropagation();
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
        cell: ({ row }) => row.index + 1,
        size: 40,
      },
      {
        id: "name",
        accessorFn: (row) => row.name,
        header: "name",
        cell: ({ getValue }) => getValue() ?? "—",
      },
      {
        id: "itemCount",
        accessorFn: (row) => row.itemCount,
        header: "count",
        cell: ({ getValue }) => getValue() ?? "—",
        size: 80,
      },
      {
        id: "totalSpent",
        accessorFn: (row) => row.totalSpent,
        header: "spent",
        cell: ({ getValue }) => formatCell("totalSpent", getValue() as number | null) ?? "—",
        size: 100,
      },
    ],
    [formatCell],
  );

  const table = useReactTable({
    data: tableData,
    columns,
    state: { expanded },
    onExpandedChange: setExpanded,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getRowId: (row, index) => row.id ?? `row-${index}`,
    getRowCanExpand: () => true,
  });

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <p className="text-sm">No {sectionName} found</p>
        <p className="text-xs mt-1">Try adjusting your search</p>
      </div>
    );
  }

  return (
    <div className={cn("transition-opacity duration-150", isLoading && "opacity-60")}>
      <table className="w-full text-xs border-collapse">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className="text-left p-1.5 border-b font-medium text-muted-foreground"
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
            <TableRow key={row.id} row={row} sectionName={sectionName} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TableRow({
  row,
  sectionName,
}: {
  readonly row: Row<AnalyticsSectionRow>;
  readonly sectionName: AnalyticsSection;
}): ReactNode {
  const isExpanded = row.getIsExpanded();
  const colSpan = row.getVisibleCells().length;

  return (
    <>
      <tr
        onClick={() => row.toggleExpanded()}
        className="border-b border-border/50 hover:bg-muted/40 cursor-pointer"
      >
        {row.getVisibleCells().map((cell) => (
          <td
            key={cell.id}
            className={cn(
              "p-1.5",
              cell.column.id === ROW_NUMBER_COLUMN_ID && "text-muted-foreground",
              cell.column.id === EXPAND_COLUMN_ID && "w-8",
            )}
          >
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </td>
        ))}
      </tr>
      {isExpanded && (
        <tr className="animate-data-in">
          <td colSpan={colSpan} className="p-0">
            <ExpandedRowContent row={row.original} sectionName={sectionName} />
          </td>
        </tr>
      )}
    </>
  );
}

function getCollectionFilterKey(sectionName: AnalyticsSection): "shop" | "scale" | "entries" {
  if (sectionName === "shops") return "shop";
  if (sectionName === "scales") return "scale";
  return "entries";
}

function ExpandedRowContent({
  row,
  sectionName,
}: {
  readonly row: AnalyticsSectionRow;
  readonly sectionName: AnalyticsSection;
}): ReactNode {
  const [offset, setOffset] = useState(0);
  const filterKey = getCollectionFilterKey(sectionName);
  const filterValue = row.id ?? row.name;
  const match = row.id ?? row.name;
  const { data, isPending, isError, error, isFetching } = useQuery({
    queryKey: ["analytics", "section-items", sectionName, match, SECTION_ITEM_PAGE_SIZE, offset],
    queryFn: () =>
      getAnalyticsSectionItems(sectionName, {
        match,
        limit: SECTION_ITEM_PAGE_SIZE,
        offset,
      }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  return (
    <div className="bg-muted/30 border-t border-border/30 p-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Items for <span className="font-medium text-foreground">{row.name}</span>
          </p>
          <Link
            to="/collection"
            search={{ [filterKey]: [filterValue] }}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors duration-150 underline-offset-2 hover:underline"
          >
            View in collection →
          </Link>
        </div>

        {isPending ? (
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {Array.from({ length: SECTION_ITEM_PAGE_SIZE }, (_, idx) => (
              <div
                key={idx}
                className="aspect-square rounded-md border border-border/50 bg-muted animate-pulse"
              />
            ))}
          </div>
        ) : isError ? (
          <p className="text-xs text-destructive">Failed to load items: {error.message}</p>
        ) : data.totalCount === 0 ? (
          <p className="text-xs text-muted-foreground">No owned items found for this row.</p>
        ) : (
          <>
            <div
              className={cn(
                "grid grid-cols-3 sm:grid-cols-6 gap-2 transition-opacity duration-150",
                isFetching && "opacity-60",
              )}
            >
              {data.items.map((item, idx) => (
                <Link
                  key={`${item.id}-${offset + idx}`}
                  to="/items/$id"
                  params={{ id: item.id }}
                  title={item.title}
                  aria-label={item.title}
                  className="animate-data-in aspect-square rounded-md overflow-hidden bg-background"
                  style={{ "--data-in-delay": `${idx * 30}ms` } as React.CSSProperties}
                >
                  {item.image ? (
                    <img
                      src={item.image}
                      alt={item.title}
                      className="w-full h-full object-cover object-top"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-muted text-[10px] text-muted-foreground">
                      No image
                    </div>
                  )}
                </Link>
              ))}
            </div>

            {data.totalCount > SECTION_ITEM_PAGE_SIZE ? (
              <div className="flex items-center justify-between gap-3 pt-1">
                <p className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                  Showing {offset + 1}–{Math.min(offset + SECTION_ITEM_PAGE_SIZE, data.totalCount)}{" "}
                  of {data.totalCount}
                </p>
                <TablePagination
                  totalCount={data.totalCount}
                  limit={SECTION_ITEM_PAGE_SIZE}
                  offset={offset}
                  onOffsetChange={setOffset}
                />
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
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

  const getPageNumbers = (): (number | "ellipsis")[] => {
    const pages: (number | "ellipsis")[] = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);

      if (currentPage > 3) {
        pages.push("ellipsis");
      }

      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (currentPage < totalPages - 2) {
        pages.push("ellipsis");
      }

      pages.push(totalPages);
    }

    return pages;
  };

  const goToPage = (page: number, e: React.MouseEvent): void => {
    e.preventDefault();
    onOffsetChange((page - 1) * limit);
  };

  return (
    <Pagination className="mx-0 w-auto">
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            href="#"
            onClick={(e) => goToPage(currentPage - 1, e)}
            className={cn(
              "cursor-pointer transition-colors duration-150 active:scale-[0.97]",
              currentPage === 1 && "pointer-events-none opacity-50",
            )}
            aria-disabled={currentPage === 1}
            text="Prev"
          />
        </PaginationItem>

        {getPageNumbers().map((page, idx) =>
          page === "ellipsis" ? (
            <PaginationItem key={`ellipsis-${idx}`}>
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={page}>
              <PaginationLink
                href="#"
                onClick={(e) => goToPage(page, e)}
                isActive={page === currentPage}
                className="cursor-pointer transition-colors duration-150 active:scale-[0.97]"
              >
                {page}
              </PaginationLink>
            </PaginationItem>
          ),
        )}

        <PaginationItem>
          <PaginationNext
            href="#"
            onClick={(e) => goToPage(currentPage + 1, e)}
            className={cn(
              "cursor-pointer transition-colors duration-150 active:scale-[0.97]",
              currentPage === totalPages && "pointer-events-none opacity-50",
            )}
            aria-disabled={currentPage === totalPages}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
