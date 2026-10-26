import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ExtensionMissing } from "@/lib/errors/extension-missing";
import { extensionBridge } from "@/lib/extension-bridge";
import type { ExtensionStatus } from "@/lib/extension-bridge";
import { EXTENSION_RELEASE } from "@/lib/extension-release";

/** Why an import did not start: the extension is still in store review, or it is missing here. */
type GateRefusal = { readonly kind: "in_review" } | ExtensionMissing;

export type MissingExtensionDialog = {
  readonly open: boolean;
  readonly refusal: GateRefusal;
};

/** Whether anyone can install the extension yet. Read at call time, so a test can flip it. */
export function extensionReleased(): boolean {
  return EXTENSION_RELEASE === "released";
}

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
  if (!extensionReleased()) {
    showDialog({ open: true, refusal: { kind: "in_review" } });
    return false;
  }
  const status = await extensionBridge.probe();
  if (status.kind === "ready") return true;
  const refusal =
    status.kind === "outdated"
      ? new ExtensionMissing({ kind: "outdated", version: status.extensionVersion })
      : new ExtensionMissing({ kind: "absent", version: null });
  showDialog({ open: true, refusal });
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
    let ready: boolean;
    try {
      ready = await requireExtension();
    } finally {
      asking.current = false;
      setChecking(false);
    }
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
