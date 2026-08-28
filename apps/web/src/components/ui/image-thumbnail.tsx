import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type ImageThumbnailProps = {
  readonly images: readonly string[];
  readonly title: string;
  readonly fallbackIcon: ReactNode;
  readonly className: string;
  readonly decorative?: boolean;
  readonly layout?: "fixed" | "masonry";
  readonly loading?: "eager" | "lazy";
  readonly showRemainingCount?: boolean;
};

export function ImageThumbnail({
  images,
  title,
  fallbackIcon,
  className,
  decorative = false,
  layout = "fixed",
  loading,
  showRemainingCount = false,
}: ImageThumbnailProps): React.JSX.Element {
  const displayImages = images.slice(0, 4);
  const remainingCount = Math.max(images.length - displayImages.length, 0);
  const hasRemainingCountOverlay = showRemainingCount && remainingCount > 0;

  if (displayImages.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-muted",
          layout === "masonry" && "aspect-video",
          className,
        )}
      >
        {fallbackIcon}
      </div>
    );
  }

  if (displayImages.length === 1) {
    return (
      <div className={cn("overflow-hidden", className)}>
        <img
          src={displayImages[0]}
          alt={decorative ? "" : title}
          className={cn("w-full object-cover object-top", layout === "fixed" && "h-full")}
          loading={loading}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-px overflow-hidden",
        displayImages.length === 4 && "grid-rows-2",
        hasRemainingCountOverlay && "relative",
        className,
      )}
    >
      <img
        src={displayImages[0]}
        alt={decorative ? "" : `${title} item 1`}
        className={cn(
          "h-full w-full object-cover object-top",
          displayImages.length === 3 && "row-span-2",
        )}
        loading={loading}
      />
      <img
        src={displayImages[1]}
        alt={decorative ? "" : `${title} item 2`}
        className="h-full w-full object-cover object-top"
        loading={loading}
      />
      {displayImages[2] ? (
        <img
          src={displayImages[2]}
          alt={decorative ? "" : `${title} item 3`}
          className="h-full w-full object-cover object-top"
          loading={loading}
        />
      ) : null}
      {displayImages[3] ? (
        <img
          src={displayImages[3]}
          alt={decorative ? "" : `${title} item 4`}
          className="h-full w-full object-cover object-top"
          loading={loading}
        />
      ) : null}
      {hasRemainingCountOverlay ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <span className="text-xs font-medium text-white">+{remainingCount}</span>
        </div>
      ) : null}
    </div>
  );
}
