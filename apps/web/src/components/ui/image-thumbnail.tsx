import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type ImageThumbnailProps = {
  readonly images: readonly string[];
  readonly title: string;
  readonly fallbackIcon: ReactNode;
  readonly className?: string;
};

export function ImageThumbnail({
  images,
  title,
  fallbackIcon,
  className,
}: ImageThumbnailProps): React.JSX.Element {
  const displayImages = images.slice(0, 4);
  const remainingCount = Math.max(images.length - 4, 0);

  if (displayImages.length === 0) {
    return (
      <div
        className={cn(
          "flex size-12 shrink-0 items-center justify-center rounded bg-muted",
          className,
        )}
      >
        {fallbackIcon}
      </div>
    );
  }

  if (displayImages.length === 1) {
    return (
      <div className={cn("relative size-12 shrink-0 overflow-hidden rounded-md", className)}>
        <img src={displayImages[0]} alt={title} className="h-full w-full object-cover object-top" />
      </div>
    );
  }

  if (displayImages.length === 2) {
    return (
      <div
        className={cn(
          "grid size-12 shrink-0 grid-cols-2 gap-px overflow-hidden rounded",
          className,
        )}
      >
        {displayImages.map((imageSrc, index) => (
          <div key={`${imageSrc}-${index}`} className="relative h-full w-full overflow-hidden">
            <img
              src={imageSrc}
              alt={`${title} ${index + 1}`}
              className="h-full w-full object-cover object-top"
            />
          </div>
        ))}
      </div>
    );
  }

  if (displayImages.length === 3) {
    return (
      <div
        className={cn(
          "grid size-12 shrink-0 grid-cols-2 gap-px overflow-hidden rounded",
          className,
        )}
      >
        <div className="relative row-span-2 h-full w-full overflow-hidden">
          <img
            src={displayImages[0]}
            alt={`${title} 1`}
            className="h-full w-full object-cover object-top"
          />
        </div>
        {displayImages.slice(1).map((imageSrc, index) => (
          <div key={`${imageSrc}-${index + 1}`} className="relative h-full w-full overflow-hidden">
            <img
              src={imageSrc}
              alt={`${title} ${index + 2}`}
              className="h-full w-full object-cover object-top"
            />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative grid size-12 shrink-0 grid-cols-2 gap-px overflow-hidden rounded",
        className,
      )}
    >
      {displayImages.map((imageSrc, index) => (
        <div key={`${imageSrc}-${index}`} className="relative h-full w-full overflow-hidden">
          <img
            src={imageSrc}
            alt={`${title} ${index + 1}`}
            className="h-full w-full object-cover object-top"
          />
        </div>
      ))}
      {remainingCount > 0 ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <span className="text-xs font-medium text-white">+{remainingCount}</span>
        </div>
      ) : null}
    </div>
  );
}
