import type { ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Image01Icon } from "@hugeicons/core-free-icons";
import { Link } from "@tanstack/react-router";
import type { Category, Currency } from "@myakiba/contracts/shared/types";
import { ImageThumbnail } from "@/components/ui/image-thumbnail";
import { getCategoryColor } from "@/lib/category-colors";
import { formatReleaseDate } from "@/lib/locale";
import type { CalendarItem } from "@/queries/calendar";

interface CalendarItemRowProps {
  readonly item: CalendarItem;
  readonly currency: Currency;
}

export function CalendarItemRow({ item, currency }: CalendarItemRowProps): ReactNode {
  const categoryColor = getCategoryColor((item.category as Category | null) ?? null);

  return (
    <Link
      {...(item.itemExternalId !== null
        ? ({
            to: "/item/$externalId",
            params: { externalId: item.itemExternalId },
          } as const)
        : ({ to: "/item/custom/$id", params: { id: item.itemId } } as const))}
      className="flex min-w-0 items-center gap-2.5 overflow-hidden rounded-md p-1.5 transition-colors duration-50 hover:bg-accent"
    >
      <ImageThumbnail
        images={item.image ? [item.image] : []}
        title={item.title}
        fallbackIcon={<HugeiconsIcon icon={Image01Icon} className="size-4 text-muted-foreground" />}
        className="size-9"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium leading-tight">{item.title}</p>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          {item.category != null && (
            <span className="truncate" style={{ color: categoryColor }}>
              {item.category}
            </span>
          )}
          {item.price != null && item.price > 0 && item.priceCurrency?.trim() && (
            <span className="shrink-0">
              {formatReleaseDate(item.price, item.priceCurrency, currency)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
