import { useEffect, useSyncExternalStore } from "react";
import { extensionBridge } from "@/lib/extension-bridge";
import type { ExtensionStatus } from "@/lib/extension-bridge";

export type MissingExtension = Extract<ExtensionStatus, { kind: "absent" | "outdated" }>;

let missing: MissingExtension | null = null;
const listeners = new Set<() => void>();

function showMissing(next: MissingExtension | null): void {
  missing = next;
  for (const listener of listeners) listener();
}

function subscribeMissing(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Asks the extension afresh before a flow that needs it. When it is missing or too old, opens
 * the one install dialog and resolves false.
 */
export async function requireExtension(): Promise<boolean> {
  const status = await extensionBridge.probe();
  if (status.kind === "ready") return true;
  showMissing(status.kind === "outdated" ? status : { kind: "absent" });
  return false;
}

export function useMissingExtension(): MissingExtension | null {
  return useSyncExternalStore(subscribeMissing, () => missing);
}

export function dismissMissingExtension(): void {
  showMissing(null);
}

export function checkExtension(): Promise<ExtensionStatus> {
  return extensionBridge.probe();
}

export function useExtensionStatus(): ExtensionStatus {
  useEffect(() => {
    void checkExtension();
  }, []);
  return useSyncExternalStore(extensionBridge.subscribe, extensionBridge.status);
}
