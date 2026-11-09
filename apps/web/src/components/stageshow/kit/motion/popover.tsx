import { useEffect, useState } from "react";
import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import "./popover.css";

/** CSS transform-origin keywords: a side, or a vertical and horizontal pair. */
export type PopoverOrigin =
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "center"
  | `${"top" | "bottom" | "center"} ${"left" | "right" | "center"}`
  | `${"left" | "right"} center`;

type Held = { style?: CSSProperties; children: ReactNode; origin: PopoverOrigin };

/**
 * A floating surface anchored to something: a menu, a snooze picker, a prompt
 * bar under a selection. It fades and scales a touch from `origin`, the side
 * nearest its trigger; the box itself never resizes while it opens. Position
 * it from rect() of the trigger.
 */
export function Popover({
  show,
  origin = "top left",
  className,
  style,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { show: boolean; origin?: PopoverOrigin }) {
  // Closing, it keeps the place and contents it had open: a scene that resets
  // the anchor or the items as it closes would otherwise make the fading
  // popover jump or change under the eye. Once it has faded, it lets go and
  // takes the live contents instantly, out of sight, so a change made while
  // it was hidden (a list reset for the next loop) doesn't play when it reopens.
  const [held, setHeld] = useState<Held | null>(null);
  if (
    show &&
    (held === null || held.style !== style || held.children !== children || held.origin !== origin)
  )
    setHeld({ style, children, origin });
  const [released, setReleased] = useState(false);
  // Open again, it holds nothing back
  if (show && released) setReleased(false);
  useEffect(() => {
    if (show) return;
    const t = setTimeout(() => setReleased(true), 320);
    return () => clearTimeout(t);
  }, [show]);
  const shown = show || released || !held ? { style, children, origin } : held;
  return (
    <div
      {...rest}
      className={`ss-popover${className ? ` ${className}` : ""}`}
      data-show={show || undefined}
      data-instant={(!show && released) || undefined}
      style={{ ["--ss-popover-origin" as string]: shown.origin, ...shown.style }}
    >
      {shown.children}
    </div>
  );
}
