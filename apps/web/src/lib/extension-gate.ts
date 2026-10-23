import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { extensionBridge } from "@/lib/extension-bridge";
import type { ExtensionStatus } from "@/lib/extension-bridge";

export type MissingExtension = Extract<ExtensionStatus, { kind: "absent" | "outdated" }>;

export type MissingExtensionDialog = {
  readonly open: boolean;
  readonly missing: MissingExtension;
};

let dialog: MissingExtensionDialog | null = null;
const listeners = new Set<() => void>();

function showDialog(next: MissingExtensionDialog | null): void {
  dialog = next;
  for (const listener of listeners) listener();
}

function subscribeDialog(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function requireExtension(): Promise<boolean> {
  const status = await extensionBridge.probe();
  if (status.kind === "ready") return true;
  showDialog({ open: true, missing: status.kind === "outdated" ? status : { kind: "absent" } });
  return false;
}

export function useMissingExtensionDialog(): MissingExtensionDialog | null {
  return useSyncExternalStore(subscribeDialog, () => dialog);
}

export function dismissMissingExtension(): void {
  if (dialog?.open) showDialog({ ...dialog, open: false });
}

export type ExtensionGate = {
  readonly checking: boolean;
  readonly gate: (proceed: () => void) => Promise<void>;
};

export function useExtensionGate(): ExtensionGate {
  const [checking, setChecking] = useState(false);
  const asking = useRef(false);
  const gate = useCallback(async (proceed: () => void) => {
    if (asking.current) return;
    asking.current = true;
    setChecking(true);
    const ready = await requireExtension();
    asking.current = false;
    setChecking(false);
    if (ready) proceed();
  }, []);
  return { checking, gate };
}

export function useExtensionStatus(): ExtensionStatus {
  useEffect(() => {
    void extensionBridge.probe();
  }, []);
  return useSyncExternalStore(extensionBridge.subscribe, extensionBridge.status);
}
