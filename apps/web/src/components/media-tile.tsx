import type { Category } from "@myakiba/contracts/shared/types";
import { Link } from "@tanstack/react-router";
import { Fragment, useRef } from "react";
import type { ComponentProps, MouseEvent, ReactNode } from "react";
import { ItemControls } from "@/components/ui/item-controls";
import { Skeleton } from "@/components/ui/skeleton";
import type { MediaViewMode } from "@/components/ui/view-toggle";
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

const ROW_IMAGE_CLASS_NAME = "size-16 rounded-md";

const GALLERY_IMAGE_CLASS_NAME = "aspect-square w-full rounded-lg";

const TILE_FOCUS_CLASS_NAME =
  "has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-ring";

type DropGeometry = { readonly before: string; readonly after: string };

// A 2 px line centred in the gap, so its offset is half the gap plus 1 px.
const CARD_DROP = { before: "inset-y-2 -left-[7px] w-0.5", after: "inset-y-2 -right-[7px] w-0.5" };
const ROW_DROP = {
  before: "inset-x-2 top-0 h-0.5 -translate-y-1/2",
  after: "inset-x-2 bottom-0 h-0.5 translate-y-1/2",
};
const GALLERY_DROP = {
  before: "inset-y-2 -left-[5px] w-0.5",
  after: "inset-y-2 -right-[5px] w-0.5",
};

export function DropIndicator({
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

const ROW_CONTROL_SELECTOR =
  '[data-slot="item-controls"], button, input, select, textarea, [role="button"], [role="checkbox"], [contenteditable="true"]';

function isControlOrLink(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(`${ROW_CONTROL_SELECTOR}, a`) !== null;
}

function followRowLink(event: MouseEvent<HTMLDivElement>): void {
  if (event.defaultPrevented || (event.button !== 0 && event.button !== 1)) return;
  const row = event.currentTarget;
  const target = event.target;
  if (!(target instanceof Element) || !row.contains(target)) return;
  if (target.closest(ROW_CONTROL_SELECTOR)) return;
  const selection = window.getSelection();
  if (
    selection?.toString() &&
    (row.contains(selection.anchorNode) || row.contains(selection.focusNode))
  ) {
    event.preventDefault();
    return;
  }
  if (target.closest("a")) return;
  const link = row.querySelector<HTMLAnchorElement>("a[data-row-link]");
  if (!link) return;
  event.preventDefault();
  // A scripted click can't open a window, so Shift opens a tab like the other modifiers.
  const newTab = event.metaKey || event.ctrlKey || event.shiftKey || event.button === 1;
  const previousTarget = link.getAttribute("target");
  if (newTab) link.setAttribute("target", "_blank");
  link.click();
  if (previousTarget === null) link.removeAttribute("target");
  else link.setAttribute("target", previousTarget);
}

// A row has one link, its title, and a press anywhere else on the row follows it.
export function MediaRow({
  selected = false,
  dropIndicator,
  controls,
  className,
  children,
  ...props
}: TileProps & { readonly controls?: ReactNode }): React.JSX.Element {
  // A click or auxclick fires on the common ancestor of the press and release targets, so a press
  // that starts or ends on a control or link would otherwise land on the row.
  const pressTouchedControlOrLink = useRef(false);
  const followUntouchedPress = (event: MouseEvent<HTMLDivElement>) => {
    const touched = pressTouchedControlOrLink.current;
    pressTouchedControlOrLink.current = false;
    if (!touched) followRowLink(event);
  };
  return (
    <>
      <DropIndicator placement={dropIndicator} geometry={ROW_DROP} />
      <div
        className={cn(
          "group/item relative min-w-0 flex cursor-pointer items-center rounded-md",
          ROW_HOVER_CLASS_NAME,
          // Half outside and half inside, so adjacent selected rows overlap into one 2 px edge.
          selected && "ring-1 ring-primary inset-ring-1 inset-ring-primary",
          TILE_FOCUS_CLASS_NAME,
          className,
        )}
        {...props}
        onPointerDownCapture={(event) => {
          pressTouchedControlOrLink.current = isControlOrLink(event.target);
        }}
        onPointerUpCapture={(event) => {
          if (isControlOrLink(event.target)) pressTouchedControlOrLink.current = true;
        }}
        // Firefox starts autoscroll on a middle press over plain content, and autoscroll swallows
        // the auxclick and the next left click.
        onMouseDownCapture={(event) => {
          if (event.button === 1 && !isControlOrLink(event.target)) event.preventDefault();
        }}
        onClickCapture={followUntouchedPress}
        onAuxClickCapture={followUntouchedPress}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3 p-2 outline-none">{children}</div>
        {controls}
      </div>
    </>
  );
}

export function MediaRowTitle({
  title,
  destination,
}: {
  readonly title: string;
  readonly destination: MediaDestination;
}): React.JSX.Element {
  return (
    <p className="truncate text-sm leading-tight font-medium" title={title}>
      <Link {...destination} data-row-link="" className="outline-none" title={title}>
        {title}
      </Link>
    </p>
  );
}

function MediaRowSkeleton(): React.JSX.Element {
  return (
    <div className="flex items-center gap-3 p-2">
      <Skeleton className={cn("shrink-0", ROW_IMAGE_CLASS_NAME)} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Skeleton className="h-3.5 w-2/3" />
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-24" />
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5 max-sm:hidden">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-14" />
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
  children,
}: {
  readonly destination: MediaDestination;
  readonly title: string;
  readonly tooltip?: boolean;
  readonly imageClassName?: string;
  readonly children: ReactNode;
}): React.JSX.Element {
  return (
    <Link {...destination} title={tooltip ? title : undefined} className="block outline-none">
      <MediaImage className={cn(GALLERY_IMAGE_CLASS_NAME, IMAGE_HOVER_CLASS_NAME, imageClassName)}>
        {children}
      </MediaImage>
      <span className="sr-only">{title}</span>
    </Link>
  );
}

export function MediaGallerySkeleton(): React.JSX.Element {
  return <Skeleton className={cn("shrink-0", GALLERY_IMAGE_CLASS_NAME)} />;
}

// Gallery matches Collection's and Orders' square gallery at their default 180 px tile size.
const MEDIA_VIEWS = {
  grid: {
    collection: "grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(176px,1fr))]",
    skeleton: <MediaCardSkeleton />,
  },
  list: { collection: "flex flex-col", skeleton: <MediaRowSkeleton /> },
  gallery: {
    collection: "grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(180px,1fr))]",
    skeleton: <MediaGallerySkeleton />,
  },
} as const satisfies Record<
  MediaViewMode,
  { readonly collection: string; readonly skeleton: ReactNode }
>;

export function MediaViewCollection({
  viewMode,
  className,
  ...props
}: ComponentProps<"div"> & { readonly viewMode: MediaViewMode }): React.JSX.Element {
  return <div className={cn(MEDIA_VIEWS[viewMode].collection, className)} {...props} />;
}

export function MediaViewSkeletons({
  viewMode,
  count,
}: {
  readonly viewMode: MediaViewMode;
  readonly count: number;
}): React.JSX.Element {
  return (
    <MediaViewCollection viewMode={viewMode} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <Fragment key={index}>{MEDIA_VIEWS[viewMode].skeleton}</Fragment>
      ))}
    </MediaViewCollection>
  );
}

// Wishlist, Item Database and List detail switch between the three views.
export function MediaViewTile({
  viewMode,
  destination,
  title,
  image,
  card,
  row,
  controls,
  controlsActive = false,
  ...tile
}: Omit<TileProps, "title" | "children"> & {
  readonly viewMode: MediaViewMode;
  readonly destination: MediaDestination;
  readonly title: string;
  readonly image: ReactNode;
  readonly card: ReactNode;
  readonly row: ReactNode;
  readonly controls?: ReactNode;
  readonly controlsActive?: boolean;
}): React.JSX.Element {
  switch (viewMode) {
    case "grid":
      return (
        <MediaCard {...tile}>
          <MediaCardImage destination={destination} title={title}>
            {image}
          </MediaCardImage>
          <MediaCardBody>{card}</MediaCardBody>
          {controls ? (
            <ItemControls variant="card" active={controlsActive}>
              {controls}
            </ItemControls>
          ) : null}
        </MediaCard>
      );
    case "list":
      return (
        <MediaRow
          {...tile}
          controls={controls ? <ItemControls variant="row">{controls}</ItemControls> : null}
        >
          <MediaImage className={ROW_IMAGE_CLASS_NAME}>{image}</MediaImage>
          {row}
        </MediaRow>
      );
    case "gallery":
      return (
        <MediaGalleryTile {...tile}>
          <MediaGalleryLink destination={destination} title={title}>
            {image}
          </MediaGalleryLink>
          {controls ? (
            <ItemControls variant="media" size="md" active={controlsActive}>
              {controls}
            </ItemControls>
          ) : null}
        </MediaGalleryTile>
      );
  }
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
