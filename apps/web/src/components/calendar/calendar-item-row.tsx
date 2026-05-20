import type { ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Image01Icon } from "@hugeicons/core-free-icons";
import { Link } from "@tanstack/react-router";
import type { Category } from "@myakiba/contracts/shared/types";
import { ImageThumbnail } from "@/components/ui/image-thumbnail";
import { getCategoryColor } from "@/lib/category-colors";
import type { CalendarItem } from "@/queries/calendar";

interface CalendarItemRowProps {
  readonly item: CalendarItem;
}

export function CalendarItemRow({ item }: CalendarItemRowProps): ReactNode {
  const categoryColor = getCategoryColor((item.category as Category | null) ?? null);

  return (
    <Link
      {...(item.itemExternalId !== null
        ? ({
            to: "/item/$externalId",
            params: { externalId: item.itemExternalId },
          } as const)
        : ({ to: "/item/custom/$id", params: { id: item.itemId } } as const))}
      className="group/row flex min-w-0 items-center gap-3 rounded-md px-1.5 py-2 transition-colors duration-150 ease-out hover:bg-muted/40"
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
            <>
              <span
                className="size-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: categoryColor }}
                aria-hidden
              />
              <span className="truncate">{item.category}</span>
            </>
          )}
          {item.status && (
            <>
              {item.category != null && <span aria-hidden>·</span>}
              <span className="truncate">{item.status}</span>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}
