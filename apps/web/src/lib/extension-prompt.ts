import { useMemo, useSyncExternalStore } from "react";

export type ExtensionPrompt =
  | { readonly kind: "needs_user"; readonly untilMs: number | null }
  | { readonly kind: "backing_off"; readonly untilMs: number | null }
  | { readonly kind: "queued" };

const URGENCY = { needs_user: 0, backing_off: 1, queued: 2 } as const satisfies Record<
  ExtensionPrompt["kind"],
  number
>;

let prompts: ReadonlyMap<string, ExtensionPrompt> = new Map();
const listeners = new Set<() => void>();

export function setExtensionPrompt(runId: string, next: ExtensionPrompt | null): void {
  const updated = new Map(prompts);
  if (next === null) updated.delete(runId);
  else updated.set(runId, next);
  prompts = updated;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useExtensionPrompt(): ExtensionPrompt | null {
  const runs = useSyncExternalStore(subscribe, () => prompts);
  return useMemo(() => {
    let urgent: ExtensionPrompt | null = null;
    for (const prompt of runs.values()) {
      if (urgent === null || URGENCY[prompt.kind] < URGENCY[urgent.kind]) urgent = prompt;
    }
    return urgent;
  }, [runs]);
}
