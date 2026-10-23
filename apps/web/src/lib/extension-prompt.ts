import { useMemo, useSyncExternalStore } from "react";

export type ExtensionPrompt =
  | { readonly kind: "needs_user"; readonly untilMs: number | null }
  | { readonly kind: "backing_off"; readonly untilMs: number | null }
  | { readonly kind: "queued" };

/** Item resync and Import/Export runs have no sync session. */
type RunPrompt = { readonly sessionId: string | null; readonly prompt: ExtensionPrompt };

const URGENCY = { needs_user: 0, backing_off: 1, queued: 2 } as const satisfies Record<
  ExtensionPrompt["kind"],
  number
>;

let prompts: ReadonlyMap<string, RunPrompt> = new Map();
const listeners = new Set<() => void>();

export function setExtensionPrompt(runId: string, next: RunPrompt | null): void {
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

export function useExtensionPrompt(sessionId?: string): ExtensionPrompt | null {
  const runs = useSyncExternalStore(subscribe, () => prompts);
  return useMemo(() => {
    let urgent: ExtensionPrompt | null = null;
    for (const run of runs.values()) {
      if (sessionId !== undefined && run.sessionId !== sessionId) continue;
      if (urgent === null || URGENCY[run.prompt.kind] < URGENCY[urgent.kind]) urgent = run.prompt;
    }
    return urgent;
  }, [runs, sessionId]);
}
