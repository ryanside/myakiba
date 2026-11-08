import type { HTMLMotionProps } from "motion/react";

export const ICON_SWAP = {
  initial: { opacity: 0, scale: 0.25, filter: "blur(4px)" },
  animate: { opacity: 1, scale: 1, filter: "blur(0px)" },
  exit: { opacity: 0, scale: 0.25, filter: "blur(4px)" },
  transition: { type: "spring", duration: 0.3, bounce: 0 },
} as const satisfies Pick<HTMLMotionProps<"span">, "initial" | "animate" | "exit" | "transition">;
