import * as React from "react";

const MOBILE_BREAKPOINT = 768;

function subscribeToMobileBreakpoint(onStoreChange: () => void): () => void {
  const mediaQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
  mediaQuery.addEventListener("change", onStoreChange);
  return () => mediaQuery.removeEventListener("change", onStoreChange);
}

function getMobileSnapshot(): boolean {
  return window.innerWidth < MOBILE_BREAKPOINT;
}

export function useIsMobile() {
  return React.useSyncExternalStore(subscribeToMobileBreakpoint, getMobileSnapshot, () => false);
}
