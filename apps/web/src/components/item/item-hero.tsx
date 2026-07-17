import type { ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Refresh01Icon } from "@hugeicons/core-free-icons";
import { Badge } from "@/components/reui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getCategoryColor } from "@/lib/category-colors";
import { formatRelativeTimeToNow } from "@/lib/date-display";
import { NO_SCALE } from "@myakiba/contracts/shared/scale";
import { ItemResyncButton } from "@/components/item/item-resync-button";
import type { ItemDetail, ResyncStatus } from "@/components/item/types";

export function ItemHero({
  item,
  isLoading,
  externalId,
  scale,
  resyncStatus,
  cooldownExpiresAt,
  isResyncPending,
  onRequestResync,
}: {
  readonly item: ItemDetail | undefined;
  readonly isLoading: boolean;
  readonly externalId: number;
  readonly scale: string;
  readonly resyncStatus: ResyncStatus;
  readonly cooldownExpiresAt: string | null;
  readonly isResyncPending: boolean;
  readonly onRequestResync: () => void;
}): ReactNode {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 sm:flex-row" aria-busy="true">
        <Skeleton className="aspect-11/15 w-48 shrink-0 rounded-xl" />
        <div className="flex flex-col items-start justify-center gap-3">
          <div className="space-y-1.5">
            <Skeleton className="h-7 w-72 max-w-[70vw]" />
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <a
                href={`https://myfigurecollection.net/item/${externalId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground transition-colors duration-150 ease-out underline-offset-4 hover:text-foreground hover:underline"
              >
                myfigurecollection.net/item/{externalId}
              </a>
              <span className="hidden text-xs text-muted-foreground/40 sm:inline">·</span>
              <span className="hidden items-center gap-1 text-xs text-muted-foreground/60 sm:flex">
                Updated <Skeleton className="inline-block h-3 w-16" />
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-12 rounded-full" />
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>

          <Button variant="ghost" size="xs" disabled className="gap-1.5">
            <HugeiconsIcon icon={Refresh01Icon} className="size-3" />
            Update data
          </Button>
        </div>
      </div>
    );
  }

  if (!item) return null;

  return (
    <div className="flex flex-col gap-6 sm:flex-row">
      {item.image ? (
        <div className="animate-data-in w-48 aspect-11/15 shrink-0 overflow-hidden rounded-xl bg-muted/30 ring-1 ring-foreground/6">
          <img
            src={item.image}
            alt={item.title}
            className="h-full w-full object-cover object-top"
            loading="lazy"
          />
        </div>
      ) : null}
      <div className="flex flex-col items-start justify-center gap-3">
        <div className="space-y-1.5">
          <h1 className="animate-data-in text-2xl font-medium tracking-tight leading-tight">
            {item.title}
          </h1>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <a
              href={`https://myfigurecollection.net/item/${externalId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground transition-colors duration-150 ease-out underline-offset-4 hover:text-foreground hover:underline"
            >
              myfigurecollection.net/item/{externalId}
            </a>
            {item.updatedAt ? (
              <>
                <span className="hidden sm:inline text-xs text-muted-foreground/40">·</span>
                <span className="text-xs text-muted-foreground/60">
                  Updated{" "}
                  <span className="animate-data-in inline-block">
                    {formatRelativeTimeToNow(new Date(item.updatedAt))}
                  </span>
                </span>
              </>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className="animate-data-in"
            style={{
              borderColor: getCategoryColor(item.category),
              color: getCategoryColor(item.category),
            }}
          >
            {item.category}
          </Badge>
          {scale !== NO_SCALE ? (
            <Badge variant="outline" className="animate-data-in">
              {scale}
            </Badge>
          ) : null}
          {item.version && item.version.length > 0 ? (
            <Badge variant="outline" className="animate-data-in">
              {item.version}
            </Badge>
          ) : null}
        </div>

        <ItemResyncButton
          status={resyncStatus}
          isPending={isResyncPending}
          cooldownExpiresAt={cooldownExpiresAt}
          onRequest={onRequestResync}
        />
      </div>
    </div>
  );
}
