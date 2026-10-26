import { useSyncExternalStore } from "react";
import * as z from "zod";
import { readLocalStorage, useLocalStorage } from "@/hooks/use-local-storage";

const PAGE_BACKGROUNDS_KEY = "appearance:pageBackgrounds";
const REDUCE_MOTION_KEY = "appearance:reduceMotion";
const DEVICE_REDUCES_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const flag = z.boolean();

export function usePageBackgrounds() {
  return useLocalStorage(PAGE_BACKGROUNDS_KEY, true, flag);
}

export function pageBackgroundsEnabled(): boolean {
  return readLocalStorage(PAGE_BACKGROUNDS_KEY, true, flag);
}

function subscribeToDeviceMotion(onStoreChange: () => void): () => void {
  const mediaQuery = window.matchMedia(DEVICE_REDUCES_MOTION_QUERY);
  mediaQuery.addEventListener("change", onStoreChange);
  return () => mediaQuery.removeEventListener("change", onStoreChange);
}

function deviceReducesMotion(): boolean {
  return window.matchMedia(DEVICE_REDUCES_MOTION_QUERY).matches;
}

interface MotionPreference {
  /** The device setting asks for less motion. */
  readonly device: boolean;
  /** The app's own Reduce motion switch is on. */
  readonly app: boolean;
  /** Skip movement, because the device or the switch asks for less motion. */
  readonly reduce: boolean;
  readonly setApp: (on: boolean) => void;
}

export function useMotionPreference(): MotionPreference {
  const device = useSyncExternalStore(subscribeToDeviceMotion, deviceReducesMotion, () => true);
  const [app, setApp] = useLocalStorage(REDUCE_MOTION_KEY, false, flag);
  return { device, app, reduce: device || app, setApp };
}
