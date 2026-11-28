import type { ReactNode } from "react";
import { DataTablePagination, pageRange } from "@/components/data-table/data-table-pagination";
import { MediaGalleryLink, MediaGallerySkeleton, MediaGalleryTile } from "@/components/media-tile";
import { Button } from "@/components/ui/button";
import { shownMessageOf } from "@/data/api";
import { itemDestination } from "@/lib/item-destination";
import { cn } from "@/lib/utils";

type PictureItem = {
  readonly id: string;
  readonly externalId: number | null;
  readonly title: string;
  readonly image: string | null;
};

type PicturePage = { readonly items: readonly PictureItem[]; readonly totalCount: number };

export function ItemPicturePages({
  data,
  isPending,
  isError,
  error,
  isFetching,
  pageSize,
  offset,
  onOffsetChange,
  empty,
}: {
  readonly data: PicturePage | undefined;
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly error: Error | null;
  readonly isFetching: boolean;
  readonly pageSize: number;
  readonly offset: number;
  readonly onOffsetChange: (offset: number) => void;
  readonly empty: ReactNode;
}): ReactNode {
  if (isPending) {
    return (
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {Array.from({ length: pageSize }, (_, idx) => (
          <MediaGallerySkeleton key={idx} />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <p className="text-xs text-destructive">Failed to load items: {shownMessageOf(error)}</p>
    );
  }

  if (!data || data.items.length === 0) {
    if (offset === 0) return empty;

    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">This item page is no longer available.</p>
        <Button type="button" variant="outline" size="xs" onClick={() => onOffsetChange(0)}>
          Return to first page
        </Button>
      </div>
    );
  }

  return (
    <>
      <div
        className={cn(
          "grid grid-cols-3 sm:grid-cols-6 gap-2 transition-opacity duration-150",
          isFetching && "opacity-60",
        )}
      >
        {data.items.map((item, idx) => (
          <MediaGalleryTile key={`${item.id}-${offset + idx}`} className="animate-data-in">
            <MediaGalleryLink
              destination={itemDestination(item.id, item.externalId)}
              title={item.title}
              tooltip
            >
              {item.image ? (
                <img
                  src={item.image}
                  alt=""
                  className="size-full object-cover object-top"
                  loading="lazy"
                />
              ) : (
                <div
                  aria-hidden="true"
                  className="flex size-full items-center justify-center text-[10px] text-muted-foreground"
                >
                  No image
                </div>
              )}
            </MediaGalleryLink>
          </MediaGalleryTile>
        ))}
      </div>

      {data.totalCount > pageSize ? (
        <div className="flex items-center justify-between gap-3 pt-1">
          <p className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
            Showing {pageRange({ totalCount: data.totalCount, limit: pageSize, offset })}
          </p>
          <DataTablePagination
            totalCount={data.totalCount}
            limit={pageSize}
            offset={offset}
            onOffsetChange={onOffsetChange}
          />
        </div>
      ) : null}
    </>
  );
}
