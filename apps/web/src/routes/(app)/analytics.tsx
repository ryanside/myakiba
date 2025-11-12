import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getAnalytics } from "@/queries/analytics";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { formatCurrency } from "@/lib/utils";
import { authClient } from "@/lib/auth-client";
import { AnalyticsSkeleton } from "@/components/skeletons/analytics-skeleton";
export const Route = createFileRoute("/(app)/analytics")({
  component: RouteComponent,
  head: () => ({
    meta: [
      {
        name: "description",
        content: "your analytics",
      },
      {
        title: "Analytics — myakiba",
      },
    ],
    links: [
      {
        rel: "icon",
        href: "/favicon.ico",
      },
    ],
    scripts: [],
  }),
});

function RouteComponent() {
  const { data: session } = authClient.useSession();
  const userCurrency = session?.user.currency || "USD";
  const { isPending, isError, data, error } = useQuery({
    queryKey: ["analytics"],
    queryFn: getAnalytics,
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  if (isPending) {
    return <AnalyticsSkeleton />;
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-y-4">
        <div className="text-lg font-medium text-destructive">
          Error: {error.message}
        </div>
      </div>
    );
  }

  const { analytics } = data;

  // Extract total collection count for progress bars
  const totalCollectionCount = analytics.totalOwned[0]?.count || 100;

  return (
    <div className="flex flex-col gap-12 max-w-6xl mx-auto">
      <div className="flex flex-col gap-2">
        <div className="flex flex-row items-start gap-4">
          <h2 className="text-2xl tracking-tight">Collection Analytics</h2>
        </div>
        <p className="text-muted-foreground text-sm font-light">
          See how your collection is distributed across different categories.
        </p>
      </div>
      <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-md font-medium">Price Range</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {analytics.priceRangeDistribution.map((range, index) => (
              <div key={index} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {range.priceRange}
                  </span>
                  <div className="flex items-center gap-2">
                    <Badge className="text-foreground" appearance="ghost">
                      {range.count} items
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {formatCurrency(range.totalValue, userCurrency)}
                    </span>
                  </div>
                </div>
                <Progress value={range.count} max={totalCollectionCount} />
              </div>
            ))}
            {analytics.priceRangeDistribution.length === 0 && (
              <div className="text-muted-foreground text-center py-8">
                No price range distribution found
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-md font-medium">Scale</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {analytics.scaleDistribution &&
              analytics.scaleDistribution.map((range, index) => (
                <div key={index} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {range.scale ? range.scale : "Non-Scale"}
                    </span>
                    <div className="flex items-center gap-2">
                      <Badge className="text-foreground" appearance="ghost">
                        {range.count} items
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {formatCurrency(range.totalValue, userCurrency)}
                      </span>
                    </div>
                  </div>
                  <Progress
                    value={range.count}
                    max={totalCollectionCount}
                    className=""
                  />
                </div>
              ))}
            {analytics.scaleDistribution &&
              analytics.scaleDistribution.length === 0 && (
                <div className="text-muted-foreground text-center py-8">
                  No scale distribution found
                </div>
              )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-md font-medium">Top Shops</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {analytics.topShops &&
              analytics.topShops.map((range, index) => (
                <div key={index} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{range.shop}</span>
                    <div className="flex items-center gap-2">
                      <Badge className="text-foreground" appearance="ghost">
                        {range.count} items
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {formatCurrency(range.totalSpent, userCurrency)}
                      </span>
                    </div>
                  </div>
                  <Progress
                    value={range.count}
                    max={totalCollectionCount}
                    className=""
                  />
                </div>
              ))}
            {analytics.topShops && analytics.topShops.length === 0 && (
              <div className="text-muted-foreground text-center py-8">
                No top shops found
              </div>
            )}
          </CardContent>
        </Card>
        {/* Top Characters */}
        <Card>
          <CardHeader>
            <CardTitle className="text-md font-medium">
              Top Characters
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {analytics.topEntriesByAllCategories.Characters &&
            analytics.topEntriesByAllCategories.Characters.length > 0 ? (
              analytics.topEntriesByAllCategories.Characters.map(
                (entry, index) => (
                  <div key={index} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">
                        {entry.originName}
                      </span>
                      <div className="flex items-center gap-2">
                        <Badge className="text-foreground" appearance="ghost">
                          {entry.itemCount} items
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {formatCurrency(entry.totalValue, userCurrency)}
                        </span>
                      </div>
                    </div>
                    <Progress
                      value={entry.itemCount}
                      max={totalCollectionCount}
                    />
                  </div>
                )
              )
            ) : (
              <div className="text-muted-foreground text-center py-8">
                No characters found
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Origins */}
        <Card>
          <CardHeader>
            <CardTitle className="text-md font-medium">Top Origins</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {analytics.topEntriesByAllCategories.Origins &&
            analytics.topEntriesByAllCategories.Origins.length > 0 ? (
              analytics.topEntriesByAllCategories.Origins.map(
                (entry, index) => (
                  <div key={index} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">
                        {entry.originName}
                      </span>
                      <div className="flex items-center gap-2">
                        <Badge className="text-foreground" appearance="ghost">
                          {entry.itemCount} items
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {formatCurrency(entry.totalValue, userCurrency)}
                        </span>
                      </div>
                    </div>
                    <Progress
                      value={entry.itemCount}
                      max={totalCollectionCount}
                    />
                  </div>
                )
              )
            ) : (
              <div className="text-muted-foreground text-center py-8">
                No origins found
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Companies */}
        <Card>
          <CardHeader>
            <CardTitle className="text-md font-medium">Top Companies</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {analytics.topEntriesByAllCategories.Companies &&
            analytics.topEntriesByAllCategories.Companies.length > 0 ? (
              analytics.topEntriesByAllCategories.Companies.map(
                (entry, index) => (
                  <div key={index} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">
                        {entry.originName}
                      </span>
                      <div className="flex items-center gap-2">
                        <Badge className="text-foreground" appearance="ghost">
                          {entry.itemCount} items
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {formatCurrency(entry.totalValue, userCurrency)}
                        </span>
                      </div>
                    </div>
                    <Progress
                      value={entry.itemCount}
                      max={totalCollectionCount}
                    />
                  </div>
                )
              )
            ) : (
              <div className="text-muted-foreground text-center py-8">
                No companies found
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Artists */}
        <Card>
          <CardHeader>
            <CardTitle className="text-md font-medium">Top Artists</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {analytics.topEntriesByAllCategories.Artists &&
            analytics.topEntriesByAllCategories.Artists.length > 0 ? (
              analytics.topEntriesByAllCategories.Artists.map(
                (entry, index) => (
                  <div key={index} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">
                        {entry.originName}
                      </span>
                      <div className="flex items-center gap-2">
                        <Badge className="text-foreground" appearance="ghost">
                          {entry.itemCount} items
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {formatCurrency(entry.totalValue, userCurrency)}
                        </span>
                      </div>
                    </div>
                    <Progress
                      value={entry.itemCount}
                      max={totalCollectionCount}
                    />
                  </div>
                )
              )
            ) : (
              <div className="text-muted-foreground text-center py-8">
                No artists found
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Materials */}
        <Card>
          <CardHeader>
            <CardTitle className="text-md font-medium">Top Materials</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {analytics.topEntriesByAllCategories.Materials &&
            analytics.topEntriesByAllCategories.Materials.length > 0 ? (
              analytics.topEntriesByAllCategories.Materials.map(
                (entry, index) => (
                  <div key={index} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">
                        {entry.originName}
                      </span>
                      <div className="flex items-center gap-2">
                        <Badge className="text-foreground" appearance="ghost">
                          {entry.itemCount} items
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {formatCurrency(entry.totalValue, userCurrency)}
                        </span>
                      </div>
                    </div>
                    <Progress
                      value={entry.itemCount}
                      max={totalCollectionCount}
                    />
                  </div>
                )
              )
            ) : (
              <div className="text-muted-foreground text-center py-8">
                No materials found
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Classifications */}
        <Card>
          <CardHeader>
            <CardTitle className="text-md font-medium">
              Top Classifications
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {analytics.topEntriesByAllCategories.Classifications &&
            analytics.topEntriesByAllCategories.Classifications.length > 0 ? (
              analytics.topEntriesByAllCategories.Classifications.map(
                (entry, index) => (
                  <div key={index} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">
                        {entry.originName}
                      </span>
                      <div className="flex items-center gap-2">
                        <Badge className="text-foreground" appearance="ghost">
                          {entry.itemCount} items
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {formatCurrency(entry.totalValue, userCurrency)}
                        </span>
                      </div>
                    </div>
                    <Progress
                      value={entry.itemCount}
                      max={totalCollectionCount}
                    />
                  </div>
                )
              )
            ) : (
              <div className="text-muted-foreground text-center py-8">
                No classifications found
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Events */}
        <Card>
          <CardHeader>
            <CardTitle className="text-md font-medium">Top Events</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {analytics.topEntriesByAllCategories.Event &&
            analytics.topEntriesByAllCategories.Event.length > 0 ? (
              analytics.topEntriesByAllCategories.Event.map((entry, index) => (
                <div key={index} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {entry.originName}
                    </span>
                    <div className="flex items-center gap-2">
                      <Badge className="text-foreground" appearance="ghost">
                        {entry.itemCount} items
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {formatCurrency(entry.totalValue, userCurrency)}
                      </span>
                    </div>
                  </div>
                  <Progress
                    value={entry.itemCount}
                    max={totalCollectionCount}
                  />
                </div>
              ))
            ) : (
              <div className="text-muted-foreground text-center py-8">
                No events found
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="">
          <CardHeader className="flex flex-row items-center gap-2">
            <CardTitle className="font-medium">Most Expensive Items</CardTitle>
          </CardHeader>
          <CardContent className="flex-1">
            <div className="space-y-3">
              {analytics.mostExpensiveCollectionItems.length > 0 ? (
                analytics.mostExpensiveCollectionItems.map((item) => (
                  <div
                    key={item.itemId}
                    className="flex items-center gap-3 p-2 rounded-md"
                  >
                    {item.itemImage && (
                      <div className="h-12 w-12 rounded-md overflow-hidden bg-muted flex-shrink-0">
                        <img
                          src={item.itemImage}
                          alt={item.itemTitle}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {item.itemTitle}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.itemCategory}
                      </p>
                      <div className="flex items-center gap-4 mt-1">
                        <p className="text-xs text-muted-foreground">
                          <span className="text-xs text-foreground font-medium">
                            {formatCurrency(item.collectionPrice, userCurrency)}
                          </span>
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No most expensive items found
                </p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card className="flex flex-row items-center justify-center bg-transparent border-none">
          <CardHeader className="flex flex-row items-center justify-center">
            <CardTitle className="text-md font-light text-nowrap">
              More coming soon! (*ˊᗜˋ*)/ᵗᑋᵃᐢᵏ ᵞᵒᵘ*
            </CardTitle>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
