import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getAnalytics } from "@/queries/analytics";
import { AnalyticsSkeleton } from "@/components/analytics/analytics-skeleton";
import { RankingCard } from "@/components/analytics/ranking-card";
import { DistributionCard } from "@/components/analytics/distribution-card";
import {
  Users,
  Globe,
  Building2,
  Palette,
  Store,
  Sparkles,
  DollarSign,
  Tag,
  Calendar,
  Boxes,
  PencilRuler,
} from "lucide-react";

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

function RouteComponent(): React.ReactNode {
  const { session } = Route.useRouteContext();
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
        <div className="text-lg font-medium text-destructive">Error: {error.message}</div>
      </div>
    );
  }

  const { analytics } = data;
  const totalCollectionCount = analytics.totalOwned[0]?.count || 100;

  // ranking cards data
  const topCharactersData =
    analytics.topEntriesByAllCategories.Characters?.map((entry, idx) => ({
      rank: idx + 1,
      entryId: entry.entryId,
      name: entry.originName,
      count: `${entry.itemCount}`,
      value: Number(entry.totalValue),
    })) || [];

  const topOriginsData =
    analytics.topEntriesByAllCategories.Origins?.map((entry, idx) => ({
      rank: idx + 1,
      entryId: entry.entryId,
      name: entry.originName,
      count: `${entry.itemCount}`,
      value: Number(entry.totalValue),
    })) || [];

  const topCompaniesData =
    analytics.topEntriesByAllCategories.Companies?.map((entry, idx) => ({
      rank: idx + 1,
      entryId: entry.entryId,
      name: entry.originName,
      count: `${entry.itemCount}`,
      value: Number(entry.totalValue),
    })) || [];

  const topArtistsData =
    analytics.topEntriesByAllCategories.Artists?.map((entry, idx) => ({
      rank: idx + 1,
      entryId: entry.entryId,
      name: entry.originName,
      count: `${entry.itemCount}`,
      value: Number(entry.totalValue),
    })) || [];

  const topShopsData =
    analytics.topShops?.map((shop, idx) => ({
      rank: idx + 1,
      shopName: shop.shop,
      name: shop.shop,
      count: `${shop.count}`,
      value: Number(shop.totalSpent),
    })) || [];

  const mostExpensiveData =
    analytics.mostExpensiveCollectionItems?.map((item, idx) => ({
      rank: idx + 1,
      itemId: item.itemId,
      name: item.itemTitle,
      category: item.itemCategory || "n/a",
      value: Number(item.collectionPrice),
    })) || [];

  const scaleData =
    analytics.scaleDistribution?.map((item, idx) => ({
      rank: idx + 1,
      scaleName: item.scale || "Non-Scale",
      name: item.scale || "Non-Scale",
      count: item.count,
      value: Number(item.totalValue),
    })) || [];

  const materialsData =
    analytics.topEntriesByAllCategories.Materials?.map((entry, idx) => ({
      rank: idx + 1,
      entryId: entry.entryId,
      name: entry.originName,
      count: entry.itemCount,
      value: Number(entry.totalValue),
    })) || [];

  const classificationsData =
    analytics.topEntriesByAllCategories.Classifications?.map((entry, idx) => ({
      rank: idx + 1,
      entryId: entry.entryId,
      name: entry.originName,
      count: entry.itemCount,
      value: Number(entry.totalValue),
    })) || [];

  const eventsData =
    analytics.topEntriesByAllCategories.Events?.map((entry, idx) => ({
      rank: idx + 1,
      entryId: entry.entryId,
      name: entry.originName,
      count: entry.itemCount,
      value: Number(entry.totalValue),
    })) || [];

  // distribution cards data
  const priceRangeData = analytics.priceRangeDistribution.map((range) => ({
    label: range.priceRange,
    count: range.count,
    value: Number(range.totalValue),
  }));

  const rankingColumns = [
    { key: "rank", label: "Rank", align: "center" as const, type: "number" as const },
    {
      key: "name",
      label: "Name",
      align: "left" as const,
      type: "string" as const,
      cellClassName: "text-foreground",
    },
    {
      key: "count",
      label: "Count",
      align: "left" as const,
      type: "number" as const,
      cellText: "items",
    },
    { key: "value", label: "Spent", align: "left" as const, type: "currency" as const },
  ];

  const expensiveColumns = [
    { key: "rank", label: "Rank", align: "center" as const },
    { key: "name", label: "Item", align: "left" as const, cellClassName: "text-foreground" },
    { key: "category", label: "Category", align: "left" as const },
    { key: "value", label: "Price", align: "left" as const, type: "currency" as const },
  ];

  const getEntryNavigation = (row: Record<string, string | number>) => {
    const entryId = row.entryId as string;
    if (!entryId) return undefined;
    return {
      to: "/collection",
      search: { entries: [entryId] },
    };
  };

  const getShopNavigation = (row: Record<string, string | number>) => {
    const shopName = row.shopName as string;
    if (!shopName) return undefined;
    return {
      to: "/collection",
      search: { shop: [shopName] },
    };
  };

  const getScaleNavigation = (row: Record<string, string | number>) => {
    const scaleName = row.scaleName as string;
    if (!scaleName) return undefined;
    return {
      to: "/collection",
      search: { scale: [scaleName] },
    };
  };

  const getItemNavigation = (row: Record<string, string | number>) => {
    const itemId = row.itemId as string;
    if (!itemId) return undefined;
    return {
      to: `/items/${itemId}`,
    };
  };

  const getPriceRangeNavigation = (item: {
    label: string;
    count: number;
    value?: string | number;
  }) => {
    const label = item.label;
    if (label === "< $50") {
      return { to: "/collection", search: { paidMax: "50" } };
    } else if (label === "$50-$100") {
      return { to: "/collection", search: { paidMin: "50", paidMax: "100" } };
    } else if (label === "$100-$200") {
      return { to: "/collection", search: { paidMin: "100", paidMax: "200" } };
    } else if (label === "$200-$500") {
      return { to: "/collection", search: { paidMin: "200", paidMax: "500" } };
    } else if (label === "> $500") {
      return { to: "/collection", search: { paidMin: "500" } };
    }
    return undefined;
  };

  return (
    <div className="flex flex-col gap-12 max-w-6xl mx-auto">
      <div className="flex flex-col gap-2">
        <div className="flex flex-row items-start gap-4">
          <h1 className="text-2xl tracking-tight">Collection Analytics</h1>
        </div>
        <p className="text-muted-foreground text-sm font-light">
          See how your collection is distributed across different categories.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2">
        <RankingCard
          title="Top Characters"
          icon={<Users className="size-4 stroke-foreground" />}
          progressKey="count"
          progressMax={totalCollectionCount}
          columns={rankingColumns}
          data={topCharactersData}
          emptyMessage="No characters found"
          className="min-h-[620px]"
          currency={userCurrency}
          getRowNavigation={getEntryNavigation}
        />

        <RankingCard
          title="Top Origins"
          icon={<Globe className="size-4 stroke-foreground" />}
          progressKey="count"
          progressMax={totalCollectionCount}
          columns={rankingColumns}
          data={topOriginsData}
          emptyMessage="No origins found"
          className="min-h-[620px]"
          currency={userCurrency}
          getRowNavigation={getEntryNavigation}
        />

        <RankingCard
          title="Top Companies"
          icon={<Building2 className="size-4 stroke-foreground" />}
          progressKey="count"
          progressMax={totalCollectionCount}
          columns={rankingColumns}
          data={topCompaniesData}
          emptyMessage="No companies found"
          className="min-h-[620px]"
          currency={userCurrency}
          getRowNavigation={getEntryNavigation}
        />

        <RankingCard
          title="Top Artists"
          icon={<Palette className="size-4 stroke-foreground" />}
          progressKey="count"
          progressMax={totalCollectionCount}
          columns={rankingColumns}
          data={topArtistsData}
          emptyMessage="No artists found"
          className="min-h-[620px]"
          currency={userCurrency}
          getRowNavigation={getEntryNavigation}
        />

        <RankingCard
          title="Top Shops"
          icon={<Store className="size-4 stroke-foreground" />}
          progressKey="count"
          progressMax={totalCollectionCount}
          columns={rankingColumns}
          data={topShopsData}
          emptyMessage="No shops found"
          className="min-h-[620px]"
          currency={userCurrency}
          getRowNavigation={getShopNavigation}
        />

        <RankingCard
          title="Top Materials"
          icon={<Boxes className="size-4 stroke-foreground" />}
          progressKey="count"
          progressMax={totalCollectionCount}
          columns={rankingColumns}
          data={materialsData}
          emptyMessage="No materials found"
          className="min-h-[620px]"
          currency={userCurrency}
          getRowNavigation={getEntryNavigation}
        />

        <RankingCard
          title="Top Classifications"
          icon={<Tag className="size-4 stroke-foreground" />}
          progressKey="count"
          progressMax={totalCollectionCount}
          columns={rankingColumns}
          data={classificationsData}
          emptyMessage="No classifications found"
          className="min-h-[620px]"
          currency={userCurrency}
          getRowNavigation={getEntryNavigation}
        />

        <RankingCard
          title="Top Events"
          icon={<Calendar className="size-4 stroke-foreground" />}
          progressKey="count"
          progressMax={totalCollectionCount}
          columns={rankingColumns}
          data={eventsData}
          emptyMessage="No events found"
          className="min-h-[620px]"
          currency={userCurrency}
          getRowNavigation={getEntryNavigation}
        />
        <RankingCard
          title="Scale"
          icon={<PencilRuler className="size-4 stroke-foreground" />}
          progressKey="count"
          progressMax={totalCollectionCount}
          columns={rankingColumns}
          data={scaleData}
          emptyMessage="No scale distribution found"
          className="lg:col-span-2"
          currency={userCurrency}
          getRowNavigation={getScaleNavigation}
        />
        <DistributionCard
          title="Price Range"
          icon={<DollarSign className="size-4 stroke-foreground" />}
          data={priceRangeData}
          maxValue={totalCollectionCount}
          emptyMessage="No price range distribution found"
          className="lg:col-span-2"
          currency={userCurrency}
          getRowNavigation={getPriceRangeNavigation}
        />
        <RankingCard
          title="Most Expensive Items"
          icon={<Sparkles className="size-4 stroke-foreground" />}
          columns={expensiveColumns}
          data={mostExpensiveData}
          emptyMessage="No expensive items found"
          className="lg:col-span-2"
          currency={userCurrency}
          getRowNavigation={getItemNavigation}
        />

        <div className="lg:col-span-2 flex items-center justify-center py-8">
          <p className="text-sm font-light text-muted-foreground">
            More coming soon! (*ˊᗜˋ*)/ᵗᑋᵃᐢᵏ ᵞᵒᵘ*
          </p>
        </div>
      </div>
    </div>
  );
}
