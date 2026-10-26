import type { ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Image01Icon } from "@hugeicons/core-free-icons";
import { Link } from "@tanstack/react-router";
import type { Currency } from "@myakiba/contracts/shared/types";
import { ImageThumbnail } from "@/components/ui/image-thumbnail";
import { CategoryLabel, MediaImage, ROW_LINK_CLASS_NAME } from "@/components/media-tile";
import { itemDestination } from "@/lib/item-destination";
import { formatReleasePrice } from "@/lib/locale";
import { cn } from "@/lib/utils";
import type { ReleaseItem } from "@/queries/dashboard";

type ReleaseRowItem = Pick<
  ReleaseItem,
  "itemId" | "itemExternalId" | "title" | "image" | "category" | "price" | "priceCurrency"
>;

export function CalendarItemRow({
  item,
  currency,
}: {
  readonly item: ReleaseRowItem;
  readonly currency: Currency;
}): ReactNode {
  return (
    <Link
      {...itemDestination(item.itemId, item.itemExternalId)}
      className={cn(
        "flex min-w-0 items-center gap-2.5 overflow-hidden rounded-md p-1.5",
        ROW_LINK_CLASS_NAME,
      )}
    >
      <MediaImage className="size-9 rounded-md">
        <ImageThumbnail
          images={item.image ? [item.image] : []}
          title={item.title}
          fallbackIcon={
            <HugeiconsIcon icon={Image01Icon} className="size-4 text-muted-foreground" />
          }
          className="size-full"
        />
      </MediaImage>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm leading-tight font-medium">{item.title}</p>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          {item.category != null && <CategoryLabel category={item.category} />}
          {item.price != null && item.price > 0 && item.priceCurrency?.trim() && (
            <span className="shrink-0 tabular-nums">
              {formatReleasePrice(item.price, item.priceCurrency, currency)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
