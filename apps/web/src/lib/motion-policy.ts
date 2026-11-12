import { MotionGlobalConfig } from "motion/react";

type EaseToken = "--ease-out" | "--ease-in-out";

/**
 * A motion curve from index.css, as the Web Animations API takes it, which can't resolve `var()`.
 * Without the stylesheet there is no curve, and the animation keeps its default.
 */
export function easing(token: EaseToken): string | undefined {
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim() || undefined;
}

/** The same curve as the four points Motion takes. */
export function motionEase(token: EaseToken) {
  const points = /^cubic-bezier\(([^,]+),([^,]+),([^,]+),([^)]+)\)$/.exec(easing(token) ?? "");
  return points
    ? ([Number(points[1]), Number(points[2]), Number(points[3]), Number(points[4])] as const)
    : undefined;
}

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
