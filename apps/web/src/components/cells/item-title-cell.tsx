import { PackageIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { mfcItemUrl } from "@myakiba/contracts/add/constants";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ImageThumbnail } from "@/components/ui/image-thumbnail";
import { itemDestination } from "@/lib/item-destination";
import { cn } from "@/lib/utils";

const FOCUS_RING = "outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** An Item's picture, title and MFC number. What follows the number comes in as `children`. */
export function ItemTitleCell({
  itemId,
  title,
  externalId,
  image,
  walkedByKeys = false,
  children,
}: {
  readonly itemId: string;
  readonly title: string;
  readonly externalId: number | null;
  readonly image: string | null;
  /** A table the keyboard walks marks focus on its links, and skips the picture's repeat of the title. */
  readonly walkedByKeys?: boolean;
  readonly children?: ReactNode;
}) {
  const destination = itemDestination(itemId, externalId);
  return (
    <div className="flex items-center gap-3 pe-4">
      <Link
        {...destination}
        {...(walkedByKeys
          ? {
              className: cn("shrink-0 rounded-md", FOCUS_RING),
              tabIndex: -1,
              "aria-hidden": true,
            }
          : { "aria-label": `View ${title}` })}
      >
        <ImageThumbnail
          images={image ? [image] : []}
          title={title}
          decorative={walkedByKeys}
          className="size-8 shrink-0 rounded-md"
          fallbackIcon={
            <HugeiconsIcon
              icon={PackageIcon}
              className="size-4"
              aria-hidden={walkedByKeys || undefined}
            />
          }
        />
      </Link>
      <div className={cn("min-w-0 space-y-px", walkedByKeys && "flex-1")}>
        <Link
          {...destination}
          title={title}
          className={cn(
            "block truncate font-medium text-foreground",
            walkedByKeys && cn("w-fit max-w-full rounded-sm", FOCUS_RING),
          )}
        >
          {title}
        </Link>
        <div className="flex items-center gap-2 font-normal">
          {externalId === null ? (
            <span className="text-xs text-muted-foreground">
              {walkedByKeys ? "Custom item" : "Custom"}
            </span>
          ) : (
            <a
              href={mfcItemUrl(externalId)}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "text-xs text-muted-foreground hover:underline",
                walkedByKeys && cn("rounded-sm tabular-nums", FOCUS_RING),
              )}
            >
              MFC #{externalId}
            </a>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}
