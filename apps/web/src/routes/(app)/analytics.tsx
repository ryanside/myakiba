import { useCallback } from "react";
import type { ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ENTRY_CATEGORIES } from "@myakiba/contracts/shared/constants";
import { getAnalytics } from "@/queries/analytics";
import { LeaderboardTable } from "@/components/analytics/leaderboard-table";
import { Section } from "@/components/analytics/section";
import { SECTION_GRADIENT_COLORS } from "@/components/analytics/section-utils";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { useUserPreferences } from "@/hooks/use-user-preferences";

const ENTRY_LEADERBOARD_COLUMNS = ["name", "itemCount", "totalSpent"] as const;
const SHOP_LEADERBOARD_COLUMNS = ["shop", "itemCount", "totalSpent"] as const;
const SCALE_LEADERBOARD_COLUMNS = ["scale", "itemCount", "totalSpent"] as const;

const PLACEHOLDER_ENTRIES = ENTRY_CATEGORIES.map((category) => ({
  category,
  uniqueOwned: 0,
  topByCount: [],
  topBySpend: [],
}));

export const Route = createFileRoute("/(app)/analytics")({
  component: RouteComponent,
  head: () => ({
    meta: [
      {
        name: "description",
        content: "your analytics",
      },
      {
        title: "Analytics - myakiba",
      },
    ],
  }),
});

function RouteComponent(): ReactNode {
  const { currency, locale } = useUserPreferences();
  const { isPending, isError, data, error } = useQuery({
    queryKey: ["analytics"],
    queryFn: getAnalytics,
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  const analytics = data?.analytics;
  const isLoading = isPending;

  const formatCell = useCallback(
    (column: string, value: string | number | null): string | number | null => {
      if (column === "totalSpent" && value !== null) {
        return formatCurrencyFromMinorUnits(Number(value), currency, locale);
      }

      return value;
    },
    [currency, locale],
  );

  if (isError) {
    return (
      <div className="flex flex-col gap-4 mx-auto max-w-4xl">
        <div className="flex flex-col gap-2 mb-2">
          <div className="flex flex-row items-start gap-4">
            <h1 className="text-2xl font-orbitron font-medium">
              analytics
              <span className="hidden sm:inline"> ⭑.ᐟ</span>
            </h1>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center h-64 gap-y-4">
          <div className="text-lg font-medium text-destructive">Error: {error.message}</div>
        </div>
      </div>
    );
  }

  const entries = analytics?.entries ?? PLACEHOLDER_ENTRIES;
  const shops = analytics?.shops ?? { uniqueOwned: 0, topByCount: [], topBySpend: [] };
  const scales = analytics?.scales ?? { uniqueOwned: 0, topByCount: [], topBySpend: [] };

  return (
    <div className="flex flex-col gap-4 mx-auto max-w-4xl">
      <div className="flex flex-col gap-2 mb-2">
        <div className="flex flex-row items-start gap-4">
          <h1 className="text-2xl font-orbitron font-medium">
            analytics
            <span className="hidden sm:inline"> ⭑.ᐟ</span>
          </h1>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {entries.map((entry, idx) => (
          <Section
            key={entry.category}
            title={entry.category}
            uniqueOwned={entry.uniqueOwned}
            gradientColor={SECTION_GRADIENT_COLORS[idx % SECTION_GRADIENT_COLORS.length]}
            isLoading={isLoading}
            link={{
              to: `/analytics/${entry.category.toLowerCase()}`,
              label: `View all ${entry.category}`,
            }}
          >
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="space-y-1">
                <h4 className="text-xs font-medium text-muted-foreground">Top by Count</h4>
                <LeaderboardTable
                  rows={entry.topByCount}
                  columns={ENTRY_LEADERBOARD_COLUMNS}
                  formatCell={formatCell}
                  isLoading={isLoading}
                  getRowNavigation={
                    isLoading
                      ? undefined
                      : (row) => ({
                          to: "/collection",
                          search: { entries: [String(row.entryId)] },
                        })
                  }
                />
              </div>
              <div className="space-y-1">
                <h4 className="text-xs font-medium text-muted-foreground">Top by Spend</h4>
                <LeaderboardTable
                  rows={entry.topBySpend}
                  columns={ENTRY_LEADERBOARD_COLUMNS}
                  formatCell={formatCell}
                  isLoading={isLoading}
                  getRowNavigation={
                    isLoading
                      ? undefined
                      : (row) => ({
                          to: "/collection",
                          search: { entries: [String(row.entryId)] },
                        })
                  }
                />
              </div>
            </div>
          </Section>
        ))}

        <Section
          title="Shops"
          uniqueOwned={shops.uniqueOwned}
          gradientColor={SECTION_GRADIENT_COLORS[entries.length % SECTION_GRADIENT_COLORS.length]}
          isLoading={isLoading}
          link={{ to: "/analytics/shops", label: "View all shops" }}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <h4 className="text-xs font-medium text-muted-foreground">Top by Count</h4>
              <LeaderboardTable
                rows={shops.topByCount}
                columns={SHOP_LEADERBOARD_COLUMNS}
                formatCell={formatCell}
                isLoading={isLoading}
                getRowNavigation={
                  isLoading
                    ? undefined
                    : (row) =>
                        row.shop
                          ? { to: "/collection", search: { shop: [String(row.shop)] } }
                          : undefined
                }
              />
            </div>
            <div className="space-y-1">
              <h4 className="text-xs font-medium text-muted-foreground">Top by Spend</h4>
              <LeaderboardTable
                rows={shops.topBySpend}
                columns={SHOP_LEADERBOARD_COLUMNS}
                formatCell={formatCell}
                isLoading={isLoading}
                getRowNavigation={
                  isLoading
                    ? undefined
                    : (row) =>
                        row.shop
                          ? { to: "/collection", search: { shop: [String(row.shop)] } }
                          : undefined
                }
              />
            </div>
          </div>
        </Section>

        <Section
          title="Scales"
          uniqueOwned={scales.uniqueOwned}
          gradientColor={
            SECTION_GRADIENT_COLORS[(entries.length + 1) % SECTION_GRADIENT_COLORS.length]
          }
          isLoading={isLoading}
          link={{ to: "/analytics/scales", label: "View all scales" }}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <h4 className="text-xs font-medium text-muted-foreground">Top by Count</h4>
              <LeaderboardTable
                rows={scales.topByCount}
                columns={SCALE_LEADERBOARD_COLUMNS}
                formatCell={formatCell}
                isLoading={isLoading}
                getRowNavigation={
                  isLoading
                    ? undefined
                    : (row) =>
                        row.scale
                          ? {
                              to: "/collection",
                              search: { scale: [String(row.scale)], category: ["Prepainted"] },
                            }
                          : undefined
                }
              />
            </div>
            <div className="space-y-1">
              <h4 className="text-xs font-medium text-muted-foreground">Top by Spend</h4>
              <LeaderboardTable
                rows={scales.topBySpend}
                columns={SCALE_LEADERBOARD_COLUMNS}
                formatCell={formatCell}
                isLoading={isLoading}
                getRowNavigation={
                  isLoading
                    ? undefined
                    : (row) =>
                        row.scale
                          ? {
                              to: "/collection",
                              search: { scale: [String(row.scale)], category: ["Prepainted"] },
                            }
                          : undefined
                }
              />
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}
