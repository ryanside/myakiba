import { useSyncExternalStore } from "react";

export type ExtensionPrompt =
  | { readonly kind: "needs_user" }
  | { readonly kind: "backing_off"; readonly untilMs: number | null }
  | { readonly kind: "queued" };

type RunPrompt = { readonly sessionId: string; readonly prompt: ExtensionPrompt };

let current: RunPrompt | null = null;
const listeners = new Set<() => void>();

export function setExtensionPrompt(next: RunPrompt | null): void {
  current = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useExtensionPrompt(sessionId?: string): ExtensionPrompt | null {
  const run = useSyncExternalStore(subscribe, () => current);
  if (run === null || (sessionId !== undefined && run.sessionId !== sessionId)) return null;
  return run.prompt;
}
