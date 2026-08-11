import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link, getRouteApi, useNavigate } from "@tanstack/react-router";
import { GridViewIcon, LeftToRightListDashIcon, PackageIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { CatalogItemSearchResult } from "@myakiba/contracts/search/schema";
import { ITEM_CATEGORY_GROUPS } from "@myakiba/contracts/shared/constants";
import type { Category, Currency, DateFormat } from "@myakiba/contracts/shared/types";
import type { CSSProperties, ReactNode } from "react";
import { DataTablePagination } from "@/components/data-table/data-table-pagination";
import { DebouncedInput } from "@/components/debounced-input";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import { getCategoryColor } from "@/lib/category-colors";
import { formatDateOnlyForDisplay } from "@/lib/date-display";
import { formatReleaseDate } from "@/lib/locale";
import { getCatalogItems } from "@/queries/search";

const itemsRoute = getRouteApi("/(app)/items");
const VIEW_MODE_KEY = "item-database:viewMode";
const GRID_TILE_SIZE = 180;
const MAX_STAGGER_INDEX = 20;
const STAGGER_DELAY_MS = 30;
const CATEGORY_GROUP_BY_CATEGORY = Object.fromEntries(
  Object.entries(ITEM_CATEGORY_GROUPS).flatMap(([group, categories]) =>
    categories.map((category) => [category, group]),
  ),
) as Readonly<Record<Category, keyof typeof ITEM_CATEGORY_GROUPS>>;

type ItemDatabaseViewMode = "grid" | "list";

function ItemDatabaseViewToggle({
  value,
  onValueChange,
}: {
  readonly value: ItemDatabaseViewMode;
  readonly onValueChange: (value: ItemDatabaseViewMode) => void;
}): React.JSX.Element {
  return (
    <ToggleGroup
      value={[value]}
      onValueChange={(newValue) => {
        if (newValue.length > 0) {
          onValueChange(newValue[0] as ItemDatabaseViewMode);
        }
      }}
      variant="outline"
    >
      <ToggleGroupItem value="grid" aria-label="Grid view">
        <HugeiconsIcon icon={GridViewIcon} strokeWidth={2} />
      </ToggleGroupItem>
      <ToggleGroupItem value="list" aria-label="List view">
        <HugeiconsIcon icon={LeftToRightListDashIcon} strokeWidth={2} />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

function ItemImage({ item }: { readonly item: CatalogItemSearchResult }): React.JSX.Element {
  if (item.image) {
    return (
      <img
        src={item.image}
        alt={item.title}
        className="aspect-square w-full object-cover object-top"
        loading="lazy"
      />
    );
  }

  return (
    <div className="flex aspect-square w-full items-center justify-center bg-muted">
      <HugeiconsIcon icon={PackageIcon} className="size-8 text-muted-foreground/40" />
    </div>
  );
}

function ItemGrid({
  items,
  currency,
  dateFormat,
}: {
  readonly items: readonly CatalogItemSearchResult[];
  readonly currency: Currency;
  readonly dateFormat: DateFormat;
}): React.JSX.Element {
  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${GRID_TILE_SIZE}px, 1fr))` }}
    >
      {items.map((item, index) => {
        const category = item.category ?? "—";
        const categoryGroup = item.category ? CATEGORY_GROUP_BY_CATEGORY[item.category] : "—";
        const categoryColor = getCategoryColor(item.category);
        const releaseDate = item.latestRelease
          ? formatDateOnlyForDisplay(item.latestRelease.date, dateFormat)
          : "—";
        const releasePrice =
          item.latestRelease?.price != null &&
          item.latestRelease.price > 0 &&
          item.latestRelease.priceCurrency?.trim()
            ? formatReleaseDate(
                item.latestRelease.price,
                item.latestRelease.priceCurrency,
                currency,
              )
            : "—";
        const staggerDelay = Math.min(index, MAX_STAGGER_INDEX) * STAGGER_DELAY_MS;

        return (
          <Link
            key={item.itemId}
            to="/item/$externalId"
            params={{ externalId: item.externalId }}
            className="animate-data-in group/media relative block overflow-hidden rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={{ "--data-in-delay": `${staggerDelay}ms` } as CSSProperties}
          >
            <ItemImage item={item} />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-1 bg-black/50 p-2.5 text-white opacity-0 backdrop-blur-sm transition-[translate,opacity] duration-150 ease-out group-hover/media:translate-y-0 group-hover/media:opacity-100 group-focus-visible/media:translate-y-0 group-focus-visible/media:opacity-100">
              <p className="line-clamp-2 text-sm font-medium leading-tight">{item.title}</p>
              <div className="mt-2 flex min-w-0 items-end justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[11px] leading-4 text-white/60">{categoryGroup}</p>
                  <p className="truncate text-xs leading-4" style={{ color: categoryColor }}>
                    {category}
                  </p>
                </div>
                <div className="shrink-0 text-right tabular-nums">
                  <p className="text-[11px] leading-4 text-white/60">{releaseDate}</p>
                  <p className="text-xs leading-4 font-medium text-white">{releasePrice}</p>
                </div>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function ItemList({
  items,
  currency,
  dateFormat,
}: {
  readonly items: readonly CatalogItemSearchResult[];
  readonly currency: Currency;
  readonly dateFormat: DateFormat;
}): React.JSX.Element {
  return (
    <div className="flex flex-col">
      {items.map((item, index) => {
        const category = item.category ?? "—";
        const categoryGroup = item.category ? CATEGORY_GROUP_BY_CATEGORY[item.category] : "—";
        const categoryColor = getCategoryColor(item.category);
        const releaseDate = item.latestRelease
          ? formatDateOnlyForDisplay(item.latestRelease.date, dateFormat)
          : "—";
        const releasePrice =
          item.latestRelease?.price != null &&
          item.latestRelease.price > 0 &&
          item.latestRelease.priceCurrency?.trim()
            ? formatReleaseDate(
                item.latestRelease.price,
                item.latestRelease.priceCurrency,
                currency,
              )
            : "—";
        const staggerDelay = Math.min(index, MAX_STAGGER_INDEX) * STAGGER_DELAY_MS;

        return (
          <Link
            key={item.itemId}
            to="/item/$externalId"
            params={{ externalId: item.externalId }}
            className="animate-data-in flex min-w-0 items-center gap-3 overflow-hidden rounded-md p-2 transition-colors duration-50 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={{ "--data-in-delay": `${staggerDelay}ms` } as CSSProperties}
          >
            <div className="size-16 shrink-0 overflow-hidden rounded-md">
              <ItemImage item={item} />
            </div>
            <div className="flex min-w-0 flex-1 flex-col self-stretch py-0.5">
              <p className="truncate text-sm font-medium leading-tight" title={item.title}>
                {item.title}
              </p>
              <div className="mt-auto flex min-w-0 items-end justify-between gap-4 pt-1.5">
                <div className="min-w-0">
                  <p className="truncate text-[11px] leading-4 text-muted-foreground">
                    {categoryGroup}
                  </p>
                  <p className="truncate text-xs leading-4" style={{ color: categoryColor }}>
                    {category}
                  </p>
                </div>
                <div className="shrink-0 text-right tabular-nums">
                  <p className="text-[11px] leading-4 text-muted-foreground">{releaseDate}</p>
                  <p className="text-xs leading-4 font-medium text-foreground">{releasePrice}</p>
                </div>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function ItemDatabaseSkeleton({ viewMode }: { readonly viewMode: ItemDatabaseViewMode }) {
  if (viewMode === "list") {
    return (
      <div className="flex flex-col">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="flex items-center gap-3 p-2">
            <Skeleton className="size-16 shrink-0 rounded-md" />
            <div className="flex h-16 flex-1 flex-col py-0.5">
              <Skeleton className="h-4 w-3/4" />
              <div className="mt-auto flex items-end justify-between gap-4 pt-1.5">
                <div className="space-y-1">
                  <Skeleton className="h-2.5 w-16" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <div className="space-y-1">
                  <Skeleton className="ml-auto h-2.5 w-16" />
                  <Skeleton className="ml-auto h-3 w-14" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${GRID_TILE_SIZE}px, 1fr))` }}
    >
      {Array.from({ length: 16 }).map((_, index) => (
        <Skeleton key={index} className="aspect-square w-full rounded-lg" />
      ))}
    </div>
  );
}

export function ItemDatabase(): React.JSX.Element {
  const search = itemsRoute.useSearch();
  const navigate = useNavigate();
  const { currency, dateFormat } = useUserPreferences();
  const [viewMode, setViewMode] = useLocalStorage<ItemDatabaseViewMode>(VIEW_MODE_KEY, "grid");
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["catalog-items", search] as const,
    queryFn: () => getCatalogItems(search),
    placeholderData: keepPreviousData,
  });

  const items = data?.items ?? [];
  const totalCount = data?.totalCount ?? 0;
  let results: ReactNode;

  if (isPending) {
    results = <ItemDatabaseSkeleton viewMode={viewMode} />;
  } else if (isError) {
    results = (
      <div className="flex h-64 flex-col items-center justify-center gap-y-4">
        <div className="text-lg font-medium text-destructive">Error: {error.message}</div>
      </div>
    );
  } else if (items.length === 0) {
    results = (
      <div className="flex h-64 flex-col items-center justify-center gap-y-4">
        <div className="text-lg text-muted-foreground">No items found.</div>
      </div>
    );
  } else if (viewMode === "grid") {
    results = <ItemGrid items={items} currency={currency} dateFormat={dateFormat} />;
  } else {
    results = <ItemList items={items} currency={currency} dateFormat={dateFormat} />;
  }

  return (
    <>
      <div className="flex w-full flex-wrap items-center gap-2">
        <DebouncedInput
          value={search.query ?? ""}
          onChange={(value) =>
            navigate({
              to: ".",
              search: (previous) => ({
                ...previous,
                query: value.toString() || undefined,
                page: 1,
              }),
            })
          }
          placeholder="Search by title, MFC ID, or entry"
          className="max-w-xs"
        />
        <div className="ml-auto">
          <ItemDatabaseViewToggle value={viewMode} onValueChange={setViewMode} />
        </div>
      </div>

      {results}

      {!isPending && !isError && totalCount > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {totalCount.toLocaleString()} {totalCount === 1 ? "item" : "items"}
          </p>
          <DataTablePagination
            totalCount={totalCount}
            limit={search.pageSize}
            offset={(search.page - 1) * search.pageSize}
            onOffsetChange={(offset) =>
              navigate({
                to: ".",
                search: (previous) => ({
                  ...previous,
                  page: Math.floor(offset / search.pageSize) + 1,
                }),
              })
            }
          />
        </div>
      ) : null}
    </>
  );
}
