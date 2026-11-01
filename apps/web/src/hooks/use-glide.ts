import { useLayoutEffect, useRef } from "react";
import { EASE_OUT_CSS, motionOff } from "@/lib/motion-policy";

const DURATION_MS = 200;

/**
 * Lets an element whose content has no known size reach its new size smoothly when `change` changes,
 * from wherever it is, instead of snapping there. Nothing moves on first paint, and a change made
 * from the keyboard stays instant. Put the returned ref on the element.
 */
export function useGlide<T extends HTMLElement>(
  change: string | null,
  {
    axis = "width",
    clip = true,
  }: { readonly axis?: "width" | "height"; readonly clip?: boolean } = {},
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
    if (from === null || from === to || motionOff()) {
      element.style.overflow = "";
      return;
    }
    if (clip) element.style.overflow = "clip";
    const animation = element.animate([{ [axis]: `${from}px` }, { [axis]: `${to}px` }], {
      duration: DURATION_MS,
      easing: EASE_OUT_CSS,
    });
    flight.current = animation;
    animation.onfinish = () => {
      flight.current = null;
      element.style.overflow = "";
    };
  }, [axis, change, clip]);

  return ref;
}
