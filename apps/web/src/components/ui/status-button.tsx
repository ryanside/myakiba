import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, motion } from "motion/react";
import type { Transition, Variants } from "motion/react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export type ButtonStatus = "idle" | "loading" | "success";

const DEFAULT_SUCCESS_DURATION = 1500;

/**
 * Tracks the status of a button's async work. `run` only observes `work`: it returns what `work`
 * returns and rethrows what it throws. `succeeded` decides whether a resolved value shows success.
 */
export function useButtonStatus({
  successDuration = DEFAULT_SUCCESS_DURATION,
}: { successDuration?: number } = {}) {
  const [status, setStatus] = useState<ButtonStatus>("idle");

  useEffect(() => {
    if (status !== "success") return;
    const timeoutId = window.setTimeout(() => setStatus("idle"), successDuration);
    return () => window.clearTimeout(timeoutId);
  }, [status, successDuration]);

  const run = useCallback(
    async <T,>(work: () => Promise<T>, succeeded: (value: T) => boolean = () => true) => {
      setStatus("loading");
      let value: T;
      try {
        value = await work();
      } catch (error) {
        setStatus("idle");
        throw error;
      }
      setStatus(succeeded(value) ? "success" : "idle");
      return value;
    },
    [],
  );

  return { status, run } as const;
}

/**
 * The status for a TanStack Form submit button. TanStack sets `isSubmitting` before `run` starts
 * and clears it after `run` settles, so the button shows loading across both gaps instead of
 * needing `disabled`, which would drop focus.
 */
export function formSubmitStatus(status: ButtonStatus, isSubmitting: boolean): ButtonStatus {
  return isSubmitting && status === "idle" ? "loading" : status;
}

const swapVariants: Variants = {
  initial: { opacity: 0, y: 8, filter: "blur(4px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  exit: { opacity: 0, y: -8, filter: "blur(4px)" },
};

// A spring keeps its velocity when the status changes mid-swap; a cubic-bezier
// would restart from zero.
const swapTransition: Transition = {
  type: "spring",
  duration: 0.3,
  bounce: 0,
};

// Bounce only on the entrance, and only on movement: opacity and blur would
// overshoot.
const successVariants: Variants = {
  ...swapVariants,
  animate: {
    ...swapVariants.animate,
    transition: {
      type: "spring",
      duration: 0.45,
      bounce: 0.35,
      opacity: swapTransition,
      filter: swapTransition,
    },
  },
};

type StatusButtonProps = React.ComponentProps<typeof Button> & {
  status: ButtonStatus;
  /** Shown next to the check, e.g. "Saved" for a "Save" button. */
  successLabel?: ReactNode;
};

export function StatusButton({
  status,
  successLabel,
  children,
  disabled,
  onClick,
  ...props
}: StatusButtonProps) {
  const isBusy = status !== "idle";
  // Success blocks a second press only when the caller disables the button.
  const ignoresClicks = status === "loading" || (status === "success" && Boolean(disabled));

  const successContent = (
    <>
      <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} />
      {successLabel ?? <span className="sr-only">Success</span>}
    </>
  );

  return (
    <Button
      {...props}
      data-status={status}
      aria-busy={status === "loading" || undefined}
      // Not `disabled`: busy keeps focus and the normal look, and the click
      // handler ignores presses meanwhile. Cancelling the click also stops a
      // form's implicit submission on Enter.
      aria-disabled={ignoresClicks || undefined}
      disabled={isBusy ? false : disabled}
      onClick={(event) => {
        if (ignoresClicks) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
    >
      <span className="inline-grid justify-items-center gap-[inherit] *:col-start-1 *:row-start-1 *:flex *:items-center *:gap-[inherit]">
        {/* Invisible copies of the widest states keep the button's width fixed. */}
        <span aria-hidden className="invisible">
          {children}
        </span>
        <span aria-hidden className="invisible">
          {successContent}
        </span>

        <AnimatePresence initial={false}>
          {status === "idle" && (
            <motion.span
              key="idle"
              variants={swapVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={swapTransition}
            >
              {children}
            </motion.span>
          )}

          {status === "loading" && (
            <motion.span
              key="loading"
              variants={swapVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={swapTransition}
            >
              <Spinner />
            </motion.span>
          )}

          {status === "success" && (
            <motion.span
              key="success"
              role="status"
              variants={successVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={swapTransition}
            >
              {successContent}
            </motion.span>
          )}
        </AnimatePresence>
      </span>
    </Button>
  );
}
