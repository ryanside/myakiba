import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getAnalytics, getEntryAnalytics } from "@/queries/analytics";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ChartPieDonutText } from "@/components/dashboard/pie-chart-donut-text";
import { formatCurrency } from "@/lib/utils";
import { useState } from "react";
import type { EntryCategory } from "@/lib/analytics/types";
import { ChartBarLabel } from "@/components/analytics/chart-bar";
import {
  Select,
  SelectValue,
  SelectItem,
  SelectTrigger,
  SelectContent,
} from "@/components/ui/select";
import Loader from "@/components/loader";
export const Route = createFileRoute("/(app)/analytics")({
  component: RouteComponent,
});

function RouteComponent() {
  const [entryCategory, setEntryCategory] =
    useState<EntryCategory>("Characters");
  const { isPending, isError, data, error } = useQuery({
    queryKey: ["analytics"],
    queryFn: getAnalytics,
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  const {
    data: entryAnalytics,
    isPending: isEntryAnalyticsPending,
    isError: isEntryAnalyticsError,
    error: entryAnalyticsError,
  } = useQuery({
    queryKey: ["entryAnalytics", entryCategory],
    queryFn: () => getEntryAnalytics(entryCategory),
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  if (isPending) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <Loader />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <div className="text-lg font-medium text-destructive">
          Error: {error.message}
        </div>
      </div>
    );
  }

  const { analytics } = data;
  console.log(JSON.stringify(analytics, null, 2));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-3">
        <ChartPieDonutText
          data={analytics.categoriesOwned}
          className="h-[300px]"
          innerRadius={95}
        />
        <ChartBarLabel
          monthlyBreakdown={analytics.monthlyBreakdown}
          className="h-[300px] aspect-auto"
        />
      </div>
      <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>Price Range Distribution</CardTitle>
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
                      {formatCurrency(range.totalValue, "USD")}
                    </span>
                  </div>
                </div>
                <Progress value={range.count} className="" />
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Scale Distribution</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {analytics.scaleDistribution.map((range, index) => (
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
                      {formatCurrency(range.totalValue, "USD")}
                    </span>
                  </div>
                </div>
                <Progress value={range.count} className="" />
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Top Shops</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {analytics.topShops.map((range, index) => (
              <div key={index} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{range.shop}</span>
                  <div className="flex items-center gap-2">
                    <Badge className="text-foreground" appearance="ghost">
                      {range.count} items
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {formatCurrency(range.totalSpent, "USD")}
                    </span>
                  </div>
                </div>
                <Progress value={range.count} className="" />
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>Top Entries By Category</CardTitle>
            <Select
              value={entryCategory}
              onValueChange={(value) =>
                setEntryCategory(value as EntryCategory)
              }
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Characters" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Characters">Characters</SelectItem>
                <SelectItem value="Companies">Companies</SelectItem>
                <SelectItem value="Origins">Origins</SelectItem>
                <SelectItem value="Artists">Artists</SelectItem>
                <SelectItem value="Materials">Materials</SelectItem>
                <SelectItem value="Events">Events</SelectItem>
                <SelectItem value="Classifications">Classifications</SelectItem>
                <SelectItem value="Event">Event</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent className="space-y-4">
            {isEntryAnalyticsPending && <div>Loading...</div>}
            {isEntryAnalyticsError && (
              <div>Error: {entryAnalyticsError.message}</div>
            )}
            {entryAnalytics &&
            entryAnalytics.entryAnalytics.topEntriesByCategory.length > 0 ? (
              entryAnalytics.entryAnalytics.topEntriesByCategory.map(
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
                          {formatCurrency(entry.totalValue, "USD")}
                        </span>
                      </div>
                    </div>
                    <Progress value={entry.itemCount} className="" />
                  </div>
                )
              )
            ) : (
              <div className="text-muted-foreground text-center py-8">
                No entries found for {entryCategory}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-3">
        <Card className="">
          <CardHeader className="flex flex-row items-center space-y-0 gap-2">
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
                            {formatCurrency(item.collectionPrice, "USD")}
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
        <Card className="">
          <CardHeader className="flex flex-row items-center space-y-0 gap-2">
            <CardTitle className="font-medium">Most Popular Items</CardTitle>
          </CardHeader>
          <CardContent className="flex-1">
            <div className="space-y-3 text-muted-foreground">
              working on it!
            </div>
          </CardContent>
        </Card>
        <Card className="">
          <CardHeader className="flex flex-row items-center space-y-0 gap-2">
            <CardTitle className="font-medium">Top Rated Items</CardTitle>
          </CardHeader>
          <CardContent className="flex-1">
            <div className="space-y-3 text-muted-foreground">
              working on it!
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
