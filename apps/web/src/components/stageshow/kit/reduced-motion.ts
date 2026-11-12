import { createContext, useContext } from "react";
import { useMotionPreference } from "@/hooks/use-appearance";

// Static stages settle motion parts too, even without an OS preference.
export const StillContext = createContext(false);

/**
 * Whether the viewer asked for reduced motion, by the app's rule: the device
 * setting or the app's own Reduce motion switch. A stage shows its still;
 * parts skip their tweens.
 */
export function useReducedMotion() {
  const still = useContext(StillContext);
  const { reduce } = useMotionPreference();
  return still || reduce;
}
