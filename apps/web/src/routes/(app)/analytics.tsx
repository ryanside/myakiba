import type { ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getAnalytics } from "@/queries/analytics";
import Loader from "@/components/loader";
import { LeaderboardTable } from "@/components/analytics/leaderboard-table";
import { SECTION_GRADIENT_COLORS, Section } from "@/components/analytics/section";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { useUserPreferences } from "@/hooks/use-user-preferences";

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

  const formatCell = (column: string, value: string | number | null): string | number | null => {
    if (column === "totalSpent" && value !== null) {
      return formatCurrencyFromMinorUnits(Number(value), currency, locale);
    }
    return value;
  };

  return (
    <div className="flex flex-col gap-6 mx-auto max-w-4xl">
      <div className="flex flex-col gap-2 mb-2">
        <h1 className="text-2xl font-orbitron font-medium">
          analytics
          <span className="hidden sm:inline"> ⭑.ᐟ</span>
        </h1>
        <p className="text-muted-foreground text-sm">See what shapes your collection.</p>
      </div>

      {isPending && <Loader className="h-64" />}

      {isError && (
        <div className="flex flex-col items-center justify-center h-64 gap-y-4">
          <div className="text-lg font-medium text-destructive">Error: {error.message}</div>
        </div>
      )}

      {analytics && (
        <>
          {analytics.entries.map((entry, idx) => (
            <Section
              key={entry.category}
              title={`${entry.category}`}
              uniqueOwned={entry.uniqueOwned}
              gradientColor={SECTION_GRADIENT_COLORS[idx % SECTION_GRADIENT_COLORS.length]}
              link={{
                to: `/analytics/${entry.category.toLowerCase()}`,
                label: `View all ${entry.category}`,
              }}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <h4 className="text-xs font-medium text-muted-foreground">Top by Count</h4>
                  <LeaderboardTable
                    rows={entry.topByCount}
                    columns={["name", "itemCount", "totalSpent"]}
                    formatCell={formatCell}
                    getRowNavigation={(row) => ({
                      to: "/collection",
                      search: { entries: [String(row.entryId)] },
                    })}
                  />
                </div>
                <div className="space-y-1">
                  <h4 className="text-xs font-medium text-muted-foreground">Top by Spend</h4>
                  <LeaderboardTable
                    rows={entry.topBySpend}
                    columns={["name", "itemCount", "totalSpent"]}
                    formatCell={formatCell}
                    getRowNavigation={(row) => ({
                      to: "/collection",
                      search: { entries: [String(row.entryId)] },
                    })}
                  />
                </div>
              </div>
            </Section>
          ))}

          <Section
            title="Shops"
            uniqueOwned={analytics.shops.uniqueOwned}
            gradientColor={
              SECTION_GRADIENT_COLORS[analytics.entries.length % SECTION_GRADIENT_COLORS.length]
            }
            link={{ to: "/analytics/shops", label: "View all shops" }}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <h4 className="text-xs font-medium text-muted-foreground">Top by Count</h4>
                <LeaderboardTable
                  rows={analytics.shops.topByCount}
                  columns={["shop", "itemCount", "totalSpent"]}
                  formatCell={formatCell}
                  getRowNavigation={(row) =>
                    row.shop
                      ? { to: "/collection", search: { shop: [String(row.shop)] } }
                      : undefined
                  }
                />
              </div>
              <div className="space-y-1">
                <h4 className="text-xs font-medium text-muted-foreground">Top by Spend</h4>
                <LeaderboardTable
                  rows={analytics.shops.topBySpend}
                  columns={["shop", "itemCount", "totalSpent"]}
                  formatCell={formatCell}
                  getRowNavigation={(row) =>
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
            uniqueOwned={analytics.scales.uniqueOwned}
            gradientColor={
              SECTION_GRADIENT_COLORS[
                (analytics.entries.length + 1) % SECTION_GRADIENT_COLORS.length
              ]
            }
            link={{ to: "/analytics/scales", label: "View all scales" }}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <h4 className="text-xs font-medium text-muted-foreground">Top by Count</h4>
                <LeaderboardTable
                  rows={analytics.scales.topByCount}
                  columns={["scale", "itemCount", "totalSpent"]}
                  formatCell={formatCell}
                  getRowNavigation={(row) =>
                    row.scale
                      ? { to: "/collection", search: { scale: [String(row.scale)] } }
                      : undefined
                  }
                />
              </div>
              <div className="space-y-1">
                <h4 className="text-xs font-medium text-muted-foreground">Top by Spend</h4>
                <LeaderboardTable
                  rows={analytics.scales.topBySpend}
                  columns={["scale", "itemCount", "totalSpent"]}
                  formatCell={formatCell}
                  getRowNavigation={(row) =>
                    row.scale
                      ? { to: "/collection", search: { scale: [String(row.scale)] } }
                      : undefined
                  }
                />
              </div>
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
