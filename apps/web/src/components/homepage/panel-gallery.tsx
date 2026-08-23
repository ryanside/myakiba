import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

type CropLayer = {
  readonly scale: number;
  readonly x: number;
  readonly y: number;
};

const PANEL_FRAMES = {
  bottom: "inset-x-(--panel-inset-inline) bottom-(--panel-inset-block) h-full",
  "bottom-left": "bottom-(--panel-inset-block) left-(--panel-inset-inline) size-full",
  "bottom-right": "right-(--panel-inset-inline) bottom-(--panel-inset-block) size-full",
  top: "inset-x-(--panel-inset-inline) top-(--panel-inset-block) h-full",
  "top-left": "top-(--panel-inset-block) left-(--panel-inset-inline) size-full",
  "top-right": "top-(--panel-inset-block) right-(--panel-inset-inline) size-full",
} as const;

type PanelSize = "single" | "wide";
type PanelVariant = keyof typeof PANEL_FRAMES;

type PanelProps = {
  readonly appImage: string;
  readonly appImageAlt: string;
  readonly appImageCrop: CropLayer;
  readonly backgroundCrop: CropLayer;
  readonly caption: string;
  readonly isDark: boolean;
  readonly rowSpan?: 1 | 2;
  readonly size: PanelSize;
  readonly variant: PanelVariant;
};

const PANELS = [
  {
    appImage: "item-detail",
    appImageAlt: "myakiba item page",
    appImageCrop: { scale: 100, x: 0, y: 0 },
    backgroundCrop: { scale: 176, x: -18, y: -38 },
    caption: "sync items with MyFigureCollection",
    rowSpan: 2,
    size: "wide",
    variant: "top-left",
  },
  {
    appImage: "calendar",
    appImageAlt: "myakiba calendar",
    appImageCrop: { scale: 280, x: -3, y: -13 },
    backgroundCrop: { scale: 176, x: -74, y: -34 },
    caption: "your own personal release calendar",
    size: "single",
    variant: "top-right",
  },
  {
    appImage: "item-database",
    appImageAlt: "myakiba item database",
    appImageCrop: { scale: 240, x: -33, y: -3 },
    backgroundCrop: { scale: 176, x: -18, y: -38 },
    caption: "synced items are saved to myakiba",
    size: "single",
    variant: "bottom-left",
  },
] as const satisfies readonly Omit<PanelProps, "isDark">[];

function Panel({
  appImage,
  appImageAlt,
  appImageCrop,
  backgroundCrop,
  caption,
  isDark,
  rowSpan = 1,
  size,
  variant,
}: PanelProps) {
  const theme = isDark ? "dark" : "light";

  return (
    <figure
      className={cn(
        "animate-appear min-w-0 [--appear-delay:520ms]",
        size === "wide" && "col-span-2",
        rowSpan === 2 && "row-span-2 flex flex-col",
      )}
      style={
        {
          "--panel-inset-block": "clamp(0.75rem, 1.8vw, 1.25rem)",
          "--panel-inset-inline": "clamp(1rem, 2.6vw, 1.75rem)",
        } as CSSProperties
      }
    >
      <div
        className={cn(
          "relative isolate overflow-hidden rounded-lg bg-muted ring-1 ring-foreground/10",
          rowSpan === 2 && "aspect-5/4 min-h-0 sm:aspect-auto sm:flex-1",
          rowSpan === 1 && size === "wide" && "aspect-1872/627",
          rowSpan === 1 && size === "single" && "aspect-907/627",
        )}
      >
        <img
          alt=""
          aria-hidden="true"
          className={cn(
            "absolute block h-auto w-(--background-image-scale) max-w-none select-none",
            rowSpan === 2 && "h-(--background-image-scale) w-auto",
          )}
          draggable={false}
          src={`/hero-bg-${theme}.webp`}
          style={
            {
              "--background-image-scale": `${backgroundCrop.scale}%`,
              left: `${backgroundCrop.x}%`,
              top: `${backgroundCrop.y}%`,
            } as CSSProperties
          }
        />
        <div
          className={cn(
            "absolute z-10 overflow-hidden rounded-md shadow-[0_12px_28px_oklch(0_0_0/0.45)] ring-1 ring-foreground/10 data-[touches-bottom=true]:rounded-b-none data-[touches-left=true]:rounded-l-none data-[touches-right=true]:rounded-r-none data-[touches-top=true]:rounded-t-none",
            PANEL_FRAMES[variant],
          )}
          data-touches-bottom={variant.startsWith("top")}
          data-touches-left={variant.endsWith("right")}
          data-touches-right={variant.endsWith("left")}
          data-touches-top={variant.startsWith("bottom")}
          data-variant={variant}
        >
          <img
            alt={appImageAlt}
            className={cn(
              "absolute block h-auto w-(--app-image-scale) max-w-none select-none",
              rowSpan === 2 && "h-(--app-image-scale) w-auto",
            )}
            draggable={false}
            height={1788}
            src={`/${appImage}-${theme}.webp`}
            style={
              {
                "--app-image-scale": `${appImageCrop.scale}%`,
                left: `${appImageCrop.x}%`,
                top: `${appImageCrop.y}%`,
              } as CSSProperties
            }
            width={2992}
          />
        </div>
      </div>
      <figcaption className="mt-3 text-sm leading-5 text-muted-foreground">{caption}</figcaption>
    </figure>
  );
}

type PanelGalleryProps = {
  readonly isDark: boolean;
};

export function PanelGallery({ isDark }: PanelGalleryProps) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-x-5 sm:gap-y-10">
      {PANELS.map((panel) => (
        <Panel {...panel} isDark={isDark} key={panel.caption} />
      ))}
    </div>
  );
}
