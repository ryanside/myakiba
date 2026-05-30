import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
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
import { getCoreRowModel, getExpandedRowModel, useReactTable } from "@tanstack/react-table";
import type { ColumnDef, ExpandedState, Row } from "@tanstack/react-table";
import Loader from "@/components/loader";
import { getAnalyticsSection, getAnalyticsSectionItems } from "@/queries/analytics";
import type { AnalyticsSectionRow } from "@/queries/analytics";
import { DebouncedInput } from "@/components/debounced-input";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/data-table/data-table";
import { DataTablePagination } from "@/components/data-table/data-table-pagination";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import { useFilters } from "@/hooks/use-filters";
import { cn } from "@/lib/utils";
import { BackLink } from "@/components/ui/back-link";
import type { CollectionFilters } from "@myakiba/contracts/collection/schema";

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
                offset={offset}
                isLoading={isFetching && !isPending}
              />
            </div>

            <div className="relative flex items-center justify-between gap-3 pt-2">
              {data.totalCount > 0 ? (
                <p className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                  Showing {offset + 1}–{Math.min(offset + limit, data.totalCount)} of{" "}
                  {data.totalCount}
                </p>
              ) : null}
              <DataTablePagination
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
  offset,
  isLoading,
}: {
  readonly rows: readonly AnalyticsSectionRow[];
  readonly formatCell: (column: string, value: string | number | null) => string | number | null;
  readonly sectionName: AnalyticsSection;
  readonly offset: number;
  readonly isLoading: boolean;
}): ReactNode {
  const [expanded, setExpanded] = useState<ExpandedState>({});

  const tableData = useMemo(() => [...rows], [rows]);

  const columns = useMemo<ColumnDef<AnalyticsSectionRow>[]>(
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
    [formatCell, offset],
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

  return (
    <DataTable.Root
      table={table}
      isLoading={isLoading}
      empty={
        <DataTable.Empty
          title={`No ${sectionName} found`}
          description="Try adjusting your search"
        />
      }
    >
      <DataTable.LoadingSurface>
        <DataTable.Table>
          <DataTable.Header useColumnSizing />
          <DataTable.Body
            onRowClick={(row) => row.toggleExpanded()}
            renderExpandedRow={(row) => (
              <ExpandedRowContent
                row={row.original as AnalyticsSectionRow}
                sectionName={sectionName}
              />
            )}
            getCellClassName={(_, columnId) =>
              cn(
                columnId === ROW_NUMBER_COLUMN_ID && "text-muted-foreground",
                columnId === EXPAND_COLUMN_ID && "w-8",
              )
            }
          />
        </DataTable.Table>
      </DataTable.LoadingSurface>
    </DataTable.Root>
  );
}

function ExpandButton({ row }: { readonly row: Row<AnalyticsSectionRow> }): ReactNode {
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

function getCollectionSearch(
  sectionName: AnalyticsSection,
  row: AnalyticsSectionRow,
): Pick<CollectionFilters, "shop" | "scale" | "entries" | "category"> {
  const value = row.id ?? row.name;

  if (sectionName === "shops") {
    return { shop: [value] };
  }

  if (sectionName === "scales") {
    return {
      scale: [value],
      category: ["Prepainted"],
    };
  }

  return { entries: [value] };
}

function ExpandedRowContent({
  row,
  sectionName,
}: {
  readonly row: AnalyticsSectionRow;
  readonly sectionName: AnalyticsSection;
}): ReactNode {
  const [offset, setOffset] = useState(0);
  const collectionSearch = getCollectionSearch(sectionName, row);
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
            search={collectionSearch}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors duration-150 underline-offset-2 hover:underline"
          >
            View in collection →
          </Link>
        </div>

        {(() => {
          if (isPending) {
            return (
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {Array.from({ length: SECTION_ITEM_PAGE_SIZE }, (_, idx) => (
                  <div
                    key={idx}
                    className="aspect-square rounded-md border border-border/50 bg-muted animate-pulse"
                  />
                ))}
              </div>
            );
          }
          if (isError) {
            return (
              <p className="text-xs text-destructive">Failed to load items: {error.message}</p>
            );
          }
          if (data.totalCount === 0) {
            return (
              <p className="text-xs text-muted-foreground">No owned items found for this row.</p>
            );
          }
          return (
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
                    {...(item.externalId !== null
                      ? ({
                          to: "/item/$externalId",
                          params: { externalId: item.externalId },
                        } as const)
                      : ({ to: "/item/custom/$id", params: { id: item.id } } as const))}
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
                    Showing {offset + 1}–
                    {Math.min(offset + SECTION_ITEM_PAGE_SIZE, data.totalCount)} of{" "}
                    {data.totalCount}
                  </p>
                  <DataTablePagination
                    totalCount={data.totalCount}
                    limit={SECTION_ITEM_PAGE_SIZE}
                    offset={offset}
                    onOffsetChange={setOffset}
                  />
                </div>
              ) : null}
            </>
          );
        })()}
      </div>
    </div>
  );
}
