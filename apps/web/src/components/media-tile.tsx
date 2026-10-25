import type { Category } from "@myakiba/contracts/shared/types";
import { Link } from "@tanstack/react-router";
import type { ComponentProps, ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { getCategoryColor } from "@/lib/category-colors";
import type { ItemDestination } from "@/lib/item-destination";
import { cn } from "@/lib/utils";

export const TILE_SURFACE_CLASS_NAME = "border border-(--tile-edge) bg-card shadow-(--tile-lift)";

// Hover strengthens the edge a surface already has, instantly. Focus is an outline and selection
// is a ring, so neither collides.
export const TILE_HOVER_CLASS_NAME = "hover:border-(--tile-edge-hover)";

// A row has no edge to strengthen, so hover tints it instead.
export const ROW_HOVER_CLASS_NAME = "hover:bg-(--row-hover)";

// A row that is itself the link sits in a scroll container that clips anything outside it, so its
// 2 px focus outline is drawn inside.
export const ROW_LINK_CLASS_NAME = cn(
  ROW_HOVER_CLASS_NAME,
  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
);

const IMAGE_HOVER_CLASS_NAME = "group-hover/item:after:border-(--image-edge-hover)";

// The card's image is inset by the card's padding, so its radius is the card's minus that padding.
const CARD_IMAGE_CLASS_NAME = "aspect-square w-full rounded-[10px]";

const GALLERY_IMAGE_CLASS_NAME = "aspect-square w-full rounded-lg";

const TILE_FOCUS_CLASS_NAME =
  "has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-ring";

type DropGeometry = { readonly before: string; readonly after: string };

const CARD_DROP = { before: "inset-y-2 -left-1.5 w-0.5", after: "inset-y-2 -right-1.5 w-0.5" };
const GALLERY_DROP = {
  before: "inset-y-2 -left-[5px] w-0.5",
  after: "inset-y-2 -right-[5px] w-0.5",
};

function DropIndicator({
  placement,
  geometry,
}: {
  readonly placement: "before" | "after" | undefined;
  readonly geometry: DropGeometry;
}): React.JSX.Element | null {
  if (!placement) return null;
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute z-30 rounded-full bg-primary",
        geometry[placement],
      )}
    />
  );
}

type MediaDestination =
  | ItemDestination
  | { readonly to: "/orders/$id"; readonly params: { readonly id: string } }
  | { readonly to: "/lists/$listId"; readonly params: { readonly listId: string } };

export function MediaImage({
  className,
  children,
}: {
  readonly className: string;
  readonly children: ReactNode;
}): React.JSX.Element {
  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden bg-muted after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:border after:border-(--image-edge)",
        className,
      )}
    >
      {children}
    </div>
  );
}

type TileProps = ComponentProps<"div"> & {
  readonly selected?: boolean;
  // Drawn before the tile, inside the sortable wrapper that positions both.
  readonly dropIndicator?: "before" | "after";
};

export function MediaCard({
  selected = false,
  dropIndicator,
  className,
  ...props
}: TileProps): React.JSX.Element {
  return (
    <>
      <DropIndicator placement={dropIndicator} geometry={CARD_DROP} />
      <div
        className={cn(
          "group/item relative min-w-0 flex h-full flex-col rounded-2xl p-1.5",
          TILE_SURFACE_CLASS_NAME,
          TILE_HOVER_CLASS_NAME,
          selected && "ring-2 ring-primary",
          TILE_FOCUS_CLASS_NAME,
          className,
        )}
        {...props}
      />
    </>
  );
}

export function MediaCardImage({
  destination,
  title,
  className,
  children,
}: {
  readonly destination: MediaDestination;
  readonly title: string;
  readonly className?: string;
  readonly children: ReactNode;
}): React.JSX.Element {
  return (
    <Link {...destination} className="block shrink-0 outline-none" title={title}>
      <MediaImage className={cn(CARD_IMAGE_CLASS_NAME, className)}>{children}</MediaImage>
    </Link>
  );
}

export function MediaCardBody({ children }: { readonly children: ReactNode }): React.JSX.Element {
  return <div className="flex min-w-0 flex-1 flex-col gap-1.5 px-1.5 pt-2.5 pb-1">{children}</div>;
}

export function MediaCardTitle({
  as: Heading = "p",
  title,
  destination,
}: {
  readonly as?: "p" | "h3";
  readonly title: string;
  readonly destination: MediaDestination;
}): React.JSX.Element {
  return (
    <Heading className="line-clamp-2 text-sm leading-snug font-medium text-pretty" title={title}>
      <Link {...destination} className="outline-none hover:underline" title={title}>
        {title}
      </Link>
    </Heading>
  );
}

export function MediaCardSkeleton({
  imageClassName,
}: {
  readonly imageClassName?: string;
}): React.JSX.Element {
  return (
    <div className={cn("flex h-full flex-col rounded-2xl p-1.5", TILE_SURFACE_CLASS_NAME)}>
      <Skeleton className={cn("shrink-0", CARD_IMAGE_CLASS_NAME, imageClassName)} />
      <div className="flex flex-col gap-2 px-1.5 pt-3 pb-1.5">
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-2/3" />
        <Skeleton className="mt-1.5 h-3.5 w-16" />
      </div>
    </div>
  );
}

// A gallery tile is only its photo, so hover rims the photo instead of the tile.
export function MediaGalleryTile({
  selected = false,
  dropIndicator,
  className,
  ...props
}: TileProps): React.JSX.Element {
  return (
    <>
      <DropIndicator placement={dropIndicator} geometry={GALLERY_DROP} />
      <div
        className={cn(
          "group/item relative min-w-0 overflow-hidden rounded-lg",
          selected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
          TILE_FOCUS_CLASS_NAME,
          className,
        )}
        {...props}
      />
    </>
  );
}

export function MediaGalleryLink({
  destination,
  title,
  tooltip = false,
  imageClassName,
  "aria-label": ariaLabel,
  children,
}: {
  readonly destination: MediaDestination;
  readonly title: string;
  readonly tooltip?: boolean;
  readonly imageClassName?: string;
  readonly "aria-label"?: string;
  readonly children: ReactNode;
}): React.JSX.Element {
  return (
    <Link
      {...destination}
      title={tooltip ? title : undefined}
      aria-label={ariaLabel}
      className="block outline-none"
    >
      <MediaImage className={cn(GALLERY_IMAGE_CLASS_NAME, IMAGE_HOVER_CLASS_NAME, imageClassName)}>
        {children}
      </MediaImage>
    </Link>
  );
}

export function MediaGallerySkeleton(): React.JSX.Element {
  return <Skeleton className={cn("shrink-0", GALLERY_IMAGE_CLASS_NAME)} />;
}

export function CategoryLabel({
  category,
}: {
  readonly category: Category | null;
}): React.JSX.Element {
  return (
    <span
      className="block min-w-0 truncate text-xs leading-4"
      style={{ color: getCategoryColor(category) }}
    >
      {category ?? "Uncategorized"}
    </span>
  );
}
