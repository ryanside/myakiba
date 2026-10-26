import { Result } from "better-result";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ExtensionMissing } from "@/lib/errors/extension-missing";
import { extensionBridge } from "@/lib/extension-bridge";
import type { ExtensionStatus } from "@/lib/extension-bridge";
import { EXTENSION_RELEASE } from "@/lib/extension-release";

/** Why an import did not start: the extension is still in store review, or it is missing here. */
export type GateRefusal = { readonly kind: "in_review" } | ExtensionMissing;

export type MissingExtensionDialog = {
  readonly open: boolean;
  readonly refusal: GateRefusal;
};

/** Whether anyone can install the extension yet. */
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

async function checkExtension(): Promise<Result<void, GateRefusal>> {
  if (!extensionReleased()) return Result.err({ kind: "in_review" });
  const status = await extensionBridge.probe();
  if (status.kind === "ready") return Result.ok();
  return Result.err(
    status.kind === "outdated"
      ? new ExtensionMissing({ kind: "outdated", version: status.extensionVersion })
      : new ExtensionMissing({ kind: "absent", version: null }),
  );
}

/** Asks for the extension before an import. A refusal opens the notice that says why. */
export async function requireExtension(): Promise<Result<void, GateRefusal>> {
  const checked = await checkExtension();
  if (checked.isErr()) showDialog({ open: true, refusal: checked.error });
  return checked;
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
    let ready: Result<void, GateRefusal>;
    try {
      ready = await requireExtension();
    } finally {
      asking.current = false;
      setChecking(false);
    }
    if (ready.isOk()) proceed();
  }, []);
  return { checking, gate };
}

export function useExtensionStatus(): ExtensionStatus {
  useEffect(() => {
    void extensionBridge.probe();
  }, []);
  return useSyncExternalStore(extensionBridge.subscribe, extensionBridge.status);
}
