import type { ReactNode } from "react";
import { useCallback } from "react";
import { createFileRoute, notFound, stripSearchParams } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { DEFAULT_LIMIT } from "@myakiba/contracts/shared/constants";
import {
  analyticsSectionSchema,
  analyticsSectionSearchSchema,
} from "@myakiba/contracts/analytics/schema";
import type {
  AnalyticsSectionSort,
  AnalyticsSectionSortOrder,
} from "@myakiba/contracts/analytics/schema";
import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { SectionTable } from "@/components/analytics/section-table";
import { SectionShell } from "@/components/analytics/section";
import { sectionGradientColor, sectionLabel } from "@/components/analytics/section-utils";
import { DebouncedInput } from "@/components/debounced-input";
import { DataTablePagination } from "@/components/data-table/data-table-pagination";
import { BackLink } from "@/components/ui/back-link";
import { Skeleton } from "@/components/ui/skeleton";
import { useFilters } from "@/hooks/use-filters";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import { getAnalyticsSection } from "@/queries/analytics";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";

const KPI_LABELS = ["Unique", "Total Items", "Total Spent", "Avg. Spent"] as const;

export const Route = createFileRoute("/(app)/analytics_/$sectionName")({
  validateSearch: analyticsSectionSearchSchema,
  search: {
    middlewares: [stripSearchParams({ limit: DEFAULT_LIMIT, offset: 0 })],
  },
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
        title: `${sectionLabel(params.sectionName)} Analytics - myakiba`,
      },
    ],
  }),
});

function RouteComponent(): ReactNode {
  const sectionName = analyticsSectionSchema.parse(Route.useParams().sectionName);
  const { currency, locale } = useUserPreferences();
  const { filters, setFilters } = useFilters("/(app)/analytics_/$sectionName");

  const limit = filters.limit ?? DEFAULT_LIMIT;
  const offset = filters.offset ?? 0;
  const search = filters.search ?? "";
  const sort = filters.sort;
  const order = filters.order;

  const { data, isPending, isError, error, isFetching } = useQuery({
    queryKey: ["analytics", "section", sectionName, { search, limit, offset, sort, order }],
    queryFn: () => getAnalyticsSection(sectionName, { search, limit, offset, sort, order }),
    staleTime: 1000 * 60 * 5,
    retry: false,
    placeholderData: keepPreviousData,
  });

  const handleSearchChange = useCallback(
    (value: string | number) => {
      setFilters({ search: String(value) || undefined, offset: 0 });
    },
    [setFilters],
  );

  const handleSortChange = useCallback(
    (
      nextSort: AnalyticsSectionSort | undefined,
      nextOrder: AnalyticsSectionSortOrder | undefined,
    ) => {
      setFilters({ sort: nextSort, order: nextOrder, offset: 0 });
    },
    [setFilters],
  );

  const label = sectionLabel(sectionName);
  const gradientColor = sectionGradientColor(sectionName);
  const isLoading = isPending || isFetching;

  const kpis = data
    ? [
        { label: KPI_LABELS[0], value: String(data.kpis.uniqueCount) },
        { label: KPI_LABELS[1], value: String(data.kpis.totalItemCount) },
        {
          label: KPI_LABELS[2],
          value: formatCurrencyFromMinorUnits(data.kpis.totalSpent, currency, locale),
        },
        {
          label: KPI_LABELS[3],
          value: formatCurrencyFromMinorUnits(data.kpis.averageSpent, currency, locale),
        },
      ]
    : KPI_LABELS.map((kpiLabel) => ({ label: kpiLabel, value: "" }));

  return (
    <div className="flex flex-col gap-6 mx-auto max-w-4xl">
      <div className="flex flex-col gap-4">
        <BackLink fallbackTo="/analytics" text="Back" font="orbitron" />
        <h1 className="text-2xl font-orbitron font-medium lowercase">
          {label}
          <span className="hidden sm:inline"> ⭑.ᐟ</span>
        </h1>
      </div>

      {isError ? (
        <div className="flex flex-col items-center justify-center h-64 gap-y-4">
          <div className="text-lg font-medium text-destructive">Error: {error.message}</div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-2">
            {kpis.map((kpi) => (
              <p key={kpi.label} className="text-md text-muted-foreground font-orbitron lowercase">
                {kpi.label}:{" "}
                {isPending ? (
                  <Skeleton className="inline-block h-5 w-16 align-middle" />
                ) : (
                  <span className="animate-data-in font-medium text-foreground">{kpi.value}</span>
                )}
              </p>
            ))}
          </div>

          <SectionShell gradientColor={gradientColor} className="space-y-4">
            <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <h3 className="text-sm font-medium font-orbitron lowercase">All {label}</h3>
              <div className="relative w-full sm:w-64">
                <HugeiconsIcon
                  icon={Search01Icon}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none"
                />
                <DebouncedInput
                  value={search}
                  onChange={handleSearchChange}
                  placeholder={`Search ${sectionName}...`}
                  className="pl-8 h-8 text-sm"
                  debounce={300}
                />
              </div>
            </div>

            <div className="relative">
              <SectionTable
                rows={data?.rows ?? []}
                sectionName={sectionName}
                offset={offset}
                isLoading={isLoading}
                sort={sort}
                order={order}
                onSortChange={handleSortChange}
              />
            </div>

            <div className="relative flex items-center justify-between gap-3 pt-2">
              {data && data.totalCount > 0 ? (
                <p className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                  Showing {offset + 1}–{Math.min(offset + limit, data.totalCount)} of{" "}
                  {data.totalCount}
                </p>
              ) : null}
              {data ? (
                <DataTablePagination
                  totalCount={data.totalCount}
                  limit={limit}
                  offset={offset}
                  onOffsetChange={(newOffset) => setFilters({ offset: newOffset })}
                />
              ) : null}
            </div>
          </SectionShell>
        </>
      )}
    </div>
  );
}
