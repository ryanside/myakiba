import type { ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { FolderAddIcon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRelativeTimeToNow } from "@/lib/date-display";
import { ItemResyncButton } from "@/components/item/item-resync-button";
import { ItemImageInspector } from "@/components/item/item-image-inspector";
import type { ItemDetail, ResyncStatus } from "@/components/item/types";
import { AddToListsDialog } from "@/components/lists/add-to-lists-dialog";
import { WishlistToggleButton } from "@/components/wishlist/wishlist-toggle-button";

export function ItemHero({
  item,
  isLoading,
  externalId,
  resyncStatus,
  cooldownExpiresAt,
  isResyncPending,
  onRequestResync,
  isWishlisted,
}: {
  readonly item: ItemDetail | undefined;
  readonly isLoading: boolean;
  readonly externalId: number;
  readonly resyncStatus: ResyncStatus;
  readonly cooldownExpiresAt: string | null;
  readonly isResyncPending: boolean;
  readonly onRequestResync: () => void;
  readonly isWishlisted: boolean;
}): ReactNode {
  if (!item && !isLoading) return null;

  return (
    <div className="flex flex-col gap-6 sm:flex-row" aria-busy={isLoading}>
      {item ? null : <Skeleton className="aspect-11/15 w-48 shrink-0 rounded-xl" />}
      {item?.image ? <ItemImageInspector image={item.image} title={item.title} /> : null}
      <div className="flex min-w-0 flex-1 flex-col items-start justify-center gap-3">
        <div className="w-full space-y-1.5">
          {item ? (
            <h1 className="animate-data-in text-2xl font-medium tracking-tight leading-tight">
              {item.title}
            </h1>
          ) : (
            <Skeleton className="h-7.5 w-72 max-w-full" />
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <a
              href={`https://myfigurecollection.net/item/${externalId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:underline"
            >
              myfigurecollection.net/item/{externalId}
            </a>
            {isLoading || item?.updatedAt ? (
              <span className="flex items-center gap-1 text-xs text-muted-foreground/60">
                Updated{" "}
                {item?.updatedAt ? (
                  <span className="animate-data-in inline-block min-w-16">
                    {formatRelativeTimeToNow(new Date(item.updatedAt))}
                  </span>
                ) : (
                  <Skeleton className="inline-block h-3 w-16" />
                )}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ItemResyncButton
            status={resyncStatus}
            isPending={isResyncPending}
            cooldownExpiresAt={cooldownExpiresAt}
            onRequest={onRequestResync}
            disabled={isLoading}
          />
          <WishlistToggleButton
            itemId={item?.id}
            itemExternalId={externalId}
            isWishlisted={isWishlisted}
            disabled={isLoading}
          />
          <AddToListsDialog
            targets={item ? [{ type: "item", id: item.id }] : []}
            targetTitle={item?.title ?? ""}
            renderTrigger={
              <Button variant="outline" size="xs" disabled={isLoading}>
                <HugeiconsIcon icon={FolderAddIcon} data-icon="inline-start" />
                Add Item to List
              </Button>
            }
          />
        </div>
      </div>
    </div>
  );
}
