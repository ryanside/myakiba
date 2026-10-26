import { PackageIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ITEM_CATEGORY_GROUPS } from "@myakiba/contracts/shared/constants";
import type { ItemDatabaseItem } from "@myakiba/contracts/search/schema";
import type { Category, Currency, DateFormat } from "@myakiba/contracts/shared/types";
import type { ComponentProps } from "react";
import {
  CategoryLabel,
  MediaCardTitle,
  MediaRowTitle,
  MediaViewTile,
} from "@/components/media-tile";
import { ImageThumbnail } from "@/components/ui/image-thumbnail";
import { formatDateOnlyForDisplay } from "@/lib/date-display";
import type { ItemDestination } from "@/lib/item-destination";
import { formatReleasePrice } from "@/lib/locale";
import { cn } from "@/lib/utils";

const CATEGORY_GROUP_BY_CATEGORY = Object.fromEntries(
  Object.entries(ITEM_CATEGORY_GROUPS).flatMap(([group, categories]) =>
    categories.map((category) => [category, group]),
  ),
) as Readonly<Record<Category, keyof typeof ITEM_CATEGORY_GROUPS>>;

type ReleaseItem = Pick<ItemDatabaseItem, "title" | "image" | "category" | "latestRelease">;

export function ReleaseItemTile({
  item,
  destination,
  currency,
  dateFormat,
  ...tile
}: Omit<ComponentProps<typeof MediaViewTile>, "title" | "image" | "card" | "row"> & {
  readonly item: ReleaseItem;
  readonly destination: ItemDestination;
  readonly currency: Currency;
  readonly dateFormat: DateFormat;
}): React.JSX.Element {
  const releasePrice = formatReleasePrice(
    item.latestRelease?.price,
    item.latestRelease?.priceCurrency,
    currency,
  );
  const priced = Boolean(releasePrice);
  const price = releasePrice ?? "No price";
  const date = item.latestRelease
    ? formatDateOnlyForDisplay(item.latestRelease.date, dateFormat)
    : "No release";
  const group = item.category ? CATEGORY_GROUP_BY_CATEGORY[item.category] : null;
  const priceTone = priced ? "font-medium text-foreground" : "text-muted-foreground";

  return (
    <MediaViewTile
      {...tile}
      destination={destination}
      title={item.title}
      image={
        <ImageThumbnail
          images={item.image ? [item.image] : []}
          title={item.title}
          fallbackIcon={
            <HugeiconsIcon icon={PackageIcon} className="size-8 text-muted-foreground/40" />
          }
          className="size-full"
          decorative
          loading="lazy"
        />
      }
      card={
        <>
          <span className="flex min-w-0 items-center justify-between gap-2">
            <CategoryLabel category={item.category} />
            {group ? (
              <span className="shrink-0 text-xs leading-4 text-muted-foreground">{group}</span>
            ) : null}
          </span>
          <MediaCardTitle title={item.title} destination={destination} />
          <span className="mt-auto flex min-w-0 items-baseline justify-between gap-2 pt-1">
            <span className={cn("text-sm leading-5 tabular-nums", priceTone)}>{price}</span>
            <span className="text-xs leading-4 text-muted-foreground tabular-nums">{date}</span>
          </span>
        </>
      }
      row={
        <>
          <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 self-stretch py-0.5">
            <MediaRowTitle title={item.title} destination={destination} />
            <span className="flex min-w-0 flex-col">
              {group ? (
                <span className="truncate text-[11px] leading-4 text-muted-foreground">
                  {group}
                </span>
              ) : null}
              <CategoryLabel category={item.category} />
            </span>
            {/* Narrow rows show the release facts here instead of in their own column. */}
            <span className="flex min-w-0 items-baseline gap-2 text-xs leading-4 text-muted-foreground tabular-nums sm:hidden">
              <span className={cn(priced && "font-medium text-foreground")}>{price}</span>
              <span className="truncate">{date}</span>
            </span>
          </span>
          <span className="flex shrink-0 flex-col items-end text-end tabular-nums max-sm:hidden">
            <span className="text-[11px] leading-4 text-muted-foreground">{date}</span>
            <span className={cn("text-xs leading-4", priceTone)}>{price}</span>
          </span>
        </>
      }
    />
  );
}
