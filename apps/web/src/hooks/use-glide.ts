import { MotionGlobalConfig } from "motion/react";
import { useLayoutEffect, useRef } from "react";

const DURATION_MS = 200;
const EASING = "cubic-bezier(0.23, 1, 0.32, 1)";
/** A change this soon after a key press is that key's doing. A held Space fires its click on release. */
const KEY_WINDOW_MS = 500;

let lastKeyAt = Number.NEGATIVE_INFINITY;
window.addEventListener(
  "keydown",
  () => {
    lastKeyAt = performance.now();
  },
  { capture: true, passive: true },
);

/**
 * Lets an element whose content has no known size reach its new size smoothly when `change` changes,
 * from wherever it is, instead of snapping there. Nothing moves on first paint, and a change made
 * from the keyboard stays instant. Put the returned ref on the element.
 */
export function useGlide<T extends HTMLElement>(
  change: string | null,
  {
    axis = "width",
    fade = false,
  }: { readonly axis?: "width" | "height"; readonly fade?: boolean } = {},
) {
  const ref = useRef<T>(null);
  const settled = useRef<number | null>(null);
  const seen = useRef(change);
  const flight = useRef<Animation | null>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || (settled.current !== null && seen.current === change)) return;
    seen.current = change;
    const from = flight.current ? element.getBoundingClientRect()[axis] : settled.current;
    flight.current?.cancel();
    flight.current = null;
    const to = element.getBoundingClientRect()[axis];
    settled.current = to;
    if (
      from === null ||
      from === to ||
      MotionGlobalConfig.skipAnimations ||
      performance.now() - lastKeyAt < KEY_WINDOW_MS
    ) {
      element.style.overflow = "";
      return;
    }
    element.style.overflow = "clip";
    const animation = element.animate(
      [
        { [axis]: `${from}px`, ...(fade && { opacity: from === 0 ? 0 : 0.4 }) },
        { [axis]: `${to}px`, ...(fade && { opacity: 1 }) },
      ],
      { duration: DURATION_MS, easing: EASING },
    );
    flight.current = animation;
    animation.onfinish = () => {
      flight.current = null;
      element.style.overflow = "";
    };
  }, [axis, change, fade]);

  return ref;
}
