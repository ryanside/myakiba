import {
  ChartColumnIcon,
  Home01Icon,
  LibraryIcon,
  PackageIcon,
  StarIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";

export type Scheme = "light" | "dark";

const NAV = [Home01Icon, ChartColumnIcon, PackageIcon, LibraryIcon, StarIcon] as const;
const ACTIVE_NAV = 1;

const CARD = { x: 50, y: 58, width: 56, height: 76, gap: 8, inset: 3 } as const;
const IMAGE = CARD.width - CARD.inset * 2;

/** Title widths of the mock cards, so the lines don't repeat in lockstep. */
const CARD_LINES = [
  [36, 22],
  [30, 18],
  [38, 24],
  [32, 16],
  [34, 20],
  [28, 22],
  [36, 18],
  [30, 24],
] as const;

const HAIRLINE = { strokeWidth: 1, vectorEffect: "non-scaling-stroke" } as const;

/** A small drawing of the app shell in one scheme's neutral tokens. It scales with its frame. */
export function ThemePreview({
  scheme,
  className,
}: {
  readonly scheme: Scheme;
  readonly className?: string;
}) {
  return (
    <svg
      viewBox="0 0 320 200"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      className={cn(scheme, "size-full", className)}
    >
      <rect width="320" height="200" className="fill-sidebar" />

      <rect x="11" y="12" width="12" height="12" rx="3.5" className="fill-primary" />
      <rect
        x="8"
        y={35 + ACTIVE_NAV * 18}
        width="18"
        height="18"
        rx="5"
        className="fill-sidebar-accent"
      />
      {NAV.map((icon, index) => (
        <HugeiconsIcon
          key={index}
          icon={icon}
          x="12"
          y={39 + index * 18}
          size={10}
          strokeWidth={1.75}
          className={
            index === ACTIVE_NAV ? "text-sidebar-accent-foreground" : "text-muted-foreground/70"
          }
        />
      ))}

      <rect
        x="34"
        y="8"
        width="280"
        height="210"
        rx="8"
        className="fill-background stroke-foreground/10"
        {...HAIRLINE}
      />
      <rect x="50" y="25" width="64" height="7" rx="2" className="fill-foreground/85" />
      <rect x="50" y="38" width="36" height="3.5" rx="1.75" className="fill-muted-foreground/40" />

      {CARD_LINES.map(([title, detail], index) => {
        const x = CARD.x + (index % 4) * (CARD.width + CARD.gap);
        const y = CARD.y + Math.floor(index / 4) * (CARD.height + CARD.gap);
        const text = y + CARD.inset + IMAGE;
        return (
          <g key={index}>
            <rect
              x={x}
              y={y}
              width={CARD.width}
              height={CARD.height}
              rx="6"
              className="fill-card stroke-foreground/10"
              {...HAIRLINE}
            />
            <rect
              x={x + CARD.inset}
              y={y + CARD.inset}
              width={IMAGE}
              height={IMAGE}
              rx={6 - CARD.inset}
              className="fill-muted"
            />
            <rect
              x={x + CARD.inset + 2}
              y={text + 7}
              width={title}
              height="3"
              rx="1.5"
              className="fill-foreground/65"
            />
            <rect
              x={x + CARD.inset + 2}
              y={text + 14}
              width={detail}
              height="3"
              rx="1.5"
              className="fill-muted-foreground/40"
            />
          </g>
        );
      })}
    </svg>
  );
}
