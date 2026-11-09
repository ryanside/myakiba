import { useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The app window a showcase screen shows, in CSS pixels. */
export const SCREEN_WIDTH = 1440;
const SCREEN_HEIGHT = 900;

/**
 * Shows a hand-built app screen as a picture of a 1440 by 900 window, scaled to fit its box.
 * The screen is markup only: it takes no input and is hidden from assistive tech, which reads
 * the label instead.
 */
export function ShowcaseFrame({
  label,
  className,
  children,
}: {
  readonly label: string;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number | null>(null);

  // Measured before the first paint, so the screen never shows at the wrong size.
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const measure = () => setScale(box.clientWidth / SCREEN_WIDTH);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={boxRef}
      role="img"
      aria-label={label}
      className={cn("relative overflow-hidden", className)}
      style={{ aspectRatio: `${SCREEN_WIDTH} / ${SCREEN_HEIGHT}` }}
    >
      <div
        inert
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 origin-top-left overflow-hidden bg-background text-foreground select-none"
        style={{
          width: SCREEN_WIDTH,
          height: SCREEN_HEIGHT,
          transform: `scale(${scale ?? 1})`,
          visibility: scale === null ? "hidden" : undefined,
        }}
      >
        {children}
      </div>
    </div>
  );
}
