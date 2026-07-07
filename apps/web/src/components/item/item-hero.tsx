import type { ReactNode } from "react";
import { Badge } from "@/components/reui/badge";
import { getCategoryColor } from "@/lib/category-colors";
import { formatRelativeTimeToNow } from "@/lib/date-display";
import { NO_SCALE } from "@myakiba/contracts/shared/scale";
import { ItemResyncButton } from "@/components/item/item-resync-button";
import type { ItemDetail, ResyncStatus } from "@/components/item/types";

export function ItemHero({
  item,
  externalId,
  scale,
  resyncStatus,
  cooldownExpiresAt,
  isResyncPending,
  onRequestResync,
}: {
  readonly item: ItemDetail;
  readonly externalId: number;
  readonly scale: string;
  readonly resyncStatus: ResyncStatus;
  readonly cooldownExpiresAt: string | null;
  readonly isResyncPending: boolean;
  readonly onRequestResync: () => void;
}): ReactNode {
  return (
    <div className="flex flex-col sm:flex-row gap-6 animate-appear">
      {item.image && (
        <div className="w-48 aspect-11/15 shrink-0 overflow-hidden rounded-xl bg-muted/30 ring-1 ring-foreground/6">
          <img
            src={item.image}
            alt={item.title}
            className="h-full w-full object-cover object-top"
            loading="lazy"
          />
        </div>
      )}
      <div className="flex flex-col items-start justify-center gap-3">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-medium tracking-tight leading-tight">{item.title}</h1>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <a
              href={`https://myfigurecollection.net/item/${externalId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground transition-colors duration-150 ease-out underline-offset-4 hover:text-foreground hover:underline"
            >
              myfigurecollection.net/item/{externalId}
            </a>
            {item.updatedAt && (
              <>
                <span className="hidden sm:inline text-xs text-muted-foreground/40">·</span>
                <span className="text-xs text-muted-foreground/60">
                  Updated {formatRelativeTimeToNow(new Date(item.updatedAt))}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            style={{
              borderColor: getCategoryColor(item.category),
              color: getCategoryColor(item.category),
            }}
          >
            {item.category}
          </Badge>
          {scale !== NO_SCALE && <Badge variant="outline">{scale}</Badge>}
          {item.version && item.version.length > 0 && (
            <Badge variant="outline">{item.version}</Badge>
          )}
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
