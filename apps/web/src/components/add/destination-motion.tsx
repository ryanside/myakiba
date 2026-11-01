import { AnimatePresence, MotionGlobalConfig, motion, useIsPresent } from "motion/react";
import { useLayoutEffect, useRef } from "react";
import type { ReactNode, RefObject } from "react";
import { keyJustPressed } from "@/hooks/use-glide";
import { cn } from "@/lib/utils";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const EASE_OUT_CSS = "cubic-bezier(0.23, 1, 0.32, 1)";
const MOVE_CSS = "cubic-bezier(0.77, 0, 0.175, 1)";
const SLIDE_MS = 220;
const COLUMNS_FADE_MS = 150;
const AT_REST = "translateY(0px)";

type Move = {
  readonly fromY: number;
  readonly toY: number;
  readonly inMs: number;
  readonly outMs: number;
  readonly delayMs: number;
};

const motionOff = () => MotionGlobalConfig.skipAnimations || keyJustPressed();

function variantsOf({ fromY, toY, inMs, outMs, delayMs }: Move) {
  return {
    from: { opacity: 0, transform: `translateY(${fromY}px)` },
    at: (instant: boolean) => ({
      opacity: 1,
      transform: AT_REST,
      transition: {
        duration: instant ? 0 : inMs / 1000,
        delay: instant ? 0 : delayMs / 1000,
        ease: EASE_OUT,
      },
      // A transform left behind would break the sticky and fixed things inside.
      transitionEnd: { transform: "none" },
    }),
    gone: (instant: boolean) => ({
      opacity: 0,
      transform: `translateY(${toY}px)`,
      transition: { duration: instant ? 0 : outMs / 1000, ease: EASE_OUT },
    }),
  };
}

// The old words are nearly gone before the new ones start, so the two never read as one smear.
export const WORDS = variantsOf({ fromY: 3, toY: -2, inMs: 160, outMs: 60, delayMs: 40 });

// The button's words are centred and its width glides, so old words kept for an exit would sit
// off-centre and clipped. The delay lets the width get far enough not to cut the new first letter.
export const BUTTON_WORDS = variantsOf({ fromY: 3, toY: 0, inMs: 150, outMs: 0, delayMs: 30 });

// The table leaves its old place first, so the fields never show through its rows.
const ORDER = variantsOf({ fromY: -4, toY: -2, inMs: 170, outMs: 90, delayMs: 50 });

/** Words or a control that the destination replaces. What leaves takes no room while it goes. */
export function Swap({
  move,
  id,
  element = "span",
  className,
  children,
}: {
  readonly move: ReturnType<typeof variantsOf>;
  /** Its identity, which changing crossfades, or null for nothing. */
  readonly id: string | null;
  readonly element?: "span" | "div";
  readonly className?: string;
  readonly children: ReactNode;
}) {
  const instant = keyJustPressed();
  const Element = element === "div" ? motion.div : motion.span;
  return (
    <AnimatePresence initial={false} mode="popLayout" custom={instant}>
      {id === null ? null : (
        <Element
          key={id}
          custom={instant}
          variants={move}
          initial="from"
          animate="at"
          exit="gone"
          className={cn("block", className)}
        >
          {children}
        </Element>
      )}
    </AnimatePresence>
  );
}

/** A leaving Order takes no click or Tab while it fades. The gap is inside, so it leaves with it. */
function OrderBody({ children }: { readonly children: ReactNode }) {
  const present = useIsPresent();
  return (
    <div inert={!present} className="pt-4">
      {children}
    </div>
  );
}

export function OrderSwap({
  id,
  children,
}: {
  readonly id: string | null;
  readonly children: ReactNode;
}) {
  return (
    <Swap move={ORDER} id={id} element="div" className="w-full">
      <OrderBody>{children}</OrderBody>
    </Swap>
  );
}

/**
 * Lets an element reach its new place by transform alone when `change` changes, from wherever an
 * earlier move has it by now. Nothing stays on it after, so sticky and fixed children go on working.
 */
export function useSlide<T extends HTMLElement>(change: string | null) {
  const ref = useRef<T>(null);
  const settled = useRef<number | null>(null);
  const seen = useRef(change);
  const flight = useRef<Animation | null>(null);

  // On every render, as anything above can move it, and only a change of `change` should glide.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element?.parentElement) return;
    const { parentElement } = element;
    const top = () =>
      element.getBoundingClientRect().top - parentElement.getBoundingClientRect().top;
    if (seen.current === change) {
      if (!flight.current) settled.current = top();
      return;
    }
    seen.current = change;
    const shown = top();
    flight.current?.cancel();
    flight.current = null;
    const layout = top();
    const from = (settled.current ?? layout) - layout + (shown - layout);
    settled.current = layout;
    if (Math.abs(from) < 0.5 || motionOff()) return;
    const animation = element.animate(
      [{ transform: `translateY(${from}px)` }, { transform: AT_REST }],
      {
        duration: SLIDE_MS,
        // Going down it must clear the Order fast. Going up it waits for the Order to fade.
        easing: from < 0 ? EASE_OUT_CSS : MOVE_CSS,
      },
    );
    flight.current = animation;
    animation.onfinish = () => {
      flight.current = null;
    };
  });

  return ref;
}

/** The header and rows fade back in when the columns change, with no old text to cross. */
export function useColumnsFade(frame: RefObject<HTMLElement | null>, columnsHidden: boolean) {
  const seen = useRef(columnsHidden);
  useLayoutEffect(() => {
    if (seen.current === columnsHidden) return;
    seen.current = columnsHidden;
    if (motionOff()) return;
    for (const group of frame.current?.querySelectorAll("thead, tbody") ?? []) {
      for (const running of group.getAnimations()) running.cancel();
      group.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: COLUMNS_FADE_MS,
        easing: EASE_OUT_CSS,
      });
    }
  }, [columnsHidden, frame]);
}
