import type { ReactNode } from "react";
import { useCallback } from "react";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ANALYTICS_SECTIONS, DEFAULT_LIMIT } from "@myakiba/contracts/shared/constants";
import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { z } from "zod";
import Loader from "@/components/loader";
import { SectionTable } from "@/components/analytics/section-table";
import { SectionShell, sectionGradientColor, sectionLabel } from "@/components/analytics/section";
import { DebouncedInput } from "@/components/debounced-input";
import { DataTablePagination } from "@/components/data-table/data-table-pagination";
import { BackLink } from "@/components/ui/back-link";
import { useFilters } from "@/hooks/use-filters";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import { getAnalyticsSection } from "@/queries/analytics";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";

const analyticsSectionSchema = z.enum(ANALYTICS_SECTIONS);

const sectionSearchSchema = z.object({
  search: z.string().optional(),
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

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
        title: `${sectionLabel(params.sectionName)} Analytics - myakiba`,
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

  const handleSearchChange = useCallback(
    (value: string | number) => {
      setFilters({ search: String(value) || undefined, offset: 0 });
    },
    [setFilters],
  );

  const label = sectionLabel(sectionName);
  const gradientColor = sectionGradientColor(sectionName);

  return (
    <div className="flex flex-col gap-6 mx-auto max-w-352">
      <div className="flex flex-col gap-4">
        <BackLink to="/analytics" text="Back" font="orbitron" />
        <h1 className="text-2xl font-orbitron font-medium lowercase">
          {label}
          <span className="hidden sm:inline"> ⭑.ᐟ</span>
        </h1>
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
                rows={data.rows}
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
          </SectionShell>
        </>
      )}
    </div>
  );
}
