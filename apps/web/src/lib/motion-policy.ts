import { MotionGlobalConfig } from "motion/react";

/** The strong ease-out every entrance uses, for Motion and for CSS and the Web Animations API. */
export const EASE_OUT = [0.23, 1, 0.32, 1] as const;
export const EASE_OUT_CSS = `cubic-bezier(${EASE_OUT.join(", ")})`;

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

/** A choice made from the keyboard stays instant. */
export const keyJustPressed = () => performance.now() - lastKeyAt < KEY_WINDOW_MS;

/** Reduced motion, by the device or the app's switch, or a change made from the keyboard. */
export const motionOff = () => MotionGlobalConfig.skipAnimations || keyJustPressed();
