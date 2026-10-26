import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import "./folder.css";

// Back panel geometry follows React Bits' Folder (flap mode, left tab) in a 200 x 160 box.
const WIDTH = 200;
const HEIGHT = 160;
const TAB_HEIGHT = 15;
const CORNER = 13;
const SHOULDER = 10;
const TAB_X = 16;
const TAB_WIDTH = 64;

const BACK_PATH = [
  `M 0 ${TAB_HEIGHT + CORNER}`,
  `Q 0 ${TAB_HEIGHT} ${CORNER} ${TAB_HEIGHT}`,
  `L ${TAB_X} ${TAB_HEIGHT}`,
  `C ${TAB_X + SHOULDER * 0.6} ${TAB_HEIGHT} ${TAB_X + SHOULDER * 0.4} 0 ${TAB_X + SHOULDER} 0`,
  `L ${TAB_X + TAB_WIDTH} 0`,
  `C ${TAB_X + TAB_WIDTH + SHOULDER * 0.6} 0 ${TAB_X + TAB_WIDTH + SHOULDER * 0.4} ${TAB_HEIGHT} ${TAB_X + TAB_WIDTH + SHOULDER} ${TAB_HEIGHT}`,
  `L ${WIDTH - CORNER} ${TAB_HEIGHT}`,
  `Q ${WIDTH} ${TAB_HEIGHT} ${WIDTH} ${TAB_HEIGHT + CORNER}`,
  `L ${WIDTH} ${HEIGHT - CORNER}`,
  `Q ${WIDTH} ${HEIGHT} ${WIDTH - CORNER} ${HEIGHT}`,
  `L ${CORNER} ${HEIGHT}`,
  `Q 0 ${HEIGHT} 0 ${HEIGHT - CORNER}`,
  "Z",
].join(" ");

type PaperSlot = {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly arc: number;
  readonly z: number;
};

// x and y are percents of the papers' box, r is degrees, arc is the extra rise when the folder opens.
const PAPER_SLOTS = [
  [{ x: 0, y: 0, r: -2, arc: 4, z: 1 }],
  [
    { x: -12, y: 3, r: -7, arc: 1, z: 1 },
    { x: 12, y: 1, r: 6, arc: 3, z: 2 },
  ],
  [
    { x: -20, y: 5, r: -10, arc: 0, z: 1 },
    { x: 20, y: 4, r: 9, arc: 0, z: 2 },
    { x: 0, y: 0, r: 1, arc: 5, z: 3 },
  ],
  [
    { x: -24, y: 7, r: -12, arc: 0, z: 1 },
    { x: 24, y: 6, r: 11, arc: 0, z: 2 },
    { x: -8, y: 2, r: -4, arc: 4, z: 3 },
    { x: 9, y: 0, r: 4, arc: 5, z: 4 },
  ],
] as const satisfies readonly (readonly PaperSlot[])[];

const BLANK_SLOTS = [
  { x: -8, y: 4, r: -6, arc: 2, z: 1 },
  { x: 7, y: 0, r: 4, arc: 4, z: 2 },
] as const satisfies readonly PaperSlot[];

function paperStyle(slot: PaperSlot, index: number): CSSProperties {
  return {
    "--x": slot.x,
    "--y": slot.y,
    "--r": slot.r,
    "--arc": slot.arc,
    "--delay": `${index * 34}ms`,
    zIndex: slot.z,
  } as CSSProperties;
}

function Papers({ images }: { readonly images: readonly string[] }): React.JSX.Element {
  const papers = images.slice(0, 4);
  const slots = PAPER_SLOTS[papers.length - 1];

  if (!slots) {
    return (
      <>
        {BLANK_SLOTS.map((slot, index) => (
          <span
            key={index}
            className="folder-paper folder-paper-blank"
            style={paperStyle(slot, index)}
          >
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
        ))}
      </>
    );
  }

  return (
    <>
      {papers.map((image, index) => (
        <span
          key={image}
          className="folder-paper"
          style={paperStyle(slots[index] ?? slots[0], index)}
        >
          <img src={image} alt="" loading="lazy" decoding="async" draggable={false} />
        </span>
      ))}
    </>
  );
}

export function Folder({
  images,
  enter = false,
  compact = false,
  className,
  children,
}: {
  readonly images: readonly string[];
  readonly enter?: boolean;
  readonly compact?: boolean;
  readonly className?: string;
  readonly children?: ReactNode;
}): React.JSX.Element {
  return (
    <div
      data-slot="folder"
      data-enter={enter ? "" : undefined}
      data-compact={compact ? "" : undefined}
      className={cn("folder", className)}
    >
      <svg
        aria-hidden="true"
        className="folder-back"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
      >
        <path d={BACK_PATH} />
      </svg>
      <span aria-hidden="true" className="folder-papers">
        <Papers images={images} />
      </span>
      <div className="folder-front">
        {children ? <div className="folder-content">{children}</div> : null}
      </div>
    </div>
  );
}

export function FolderLabel({
  title,
  description,
}: {
  readonly title: string;
  readonly description?: string | null;
}): React.JSX.Element {
  return (
    <span className="flex min-w-0 flex-col gap-1">
      <span className="line-clamp-2 text-sm leading-snug font-medium text-pretty [overflow-wrap:anywhere]">
        {title}
      </span>
      {description ? (
        <span className="folder-description line-clamp-2 text-xs leading-4 text-pretty text-muted-foreground">
          {description}
        </span>
      ) : null}
    </span>
  );
}
