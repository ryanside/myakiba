import { focusManager } from "@tanstack/react-query";
import { format } from "date-fns";
import { useSyncExternalStore } from "react";

function readToday(): string {
  return format(new Date(), "yyyy-MM-dd");
}

function subscribeToDayChange(onChange: () => void): () => void {
  let midnightTimer: ReturnType<typeof setTimeout>;
  const scheduleNextMidnight = () => {
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    midnightTimer = setTimeout(() => {
      onChange();
      scheduleNextMidnight();
    }, nextMidnight.getTime() - now.getTime());
  };
  scheduleNextMidnight();
  const unsubscribeFocus = focusManager.subscribe(onChange);
  return () => {
    clearTimeout(midnightTimer);
    unsubscribeFocus();
  };
}

export function useToday(): string {
  return useSyncExternalStore(subscribeToDayChange, readToday);
}
