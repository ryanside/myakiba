import { Result } from "better-result";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { extensionBridge } from "@/lib/extension-bridge";
import type { ExtensionStatus } from "@/lib/extension-bridge";

/** Why an Item Refresh did not start: the extension is missing or too old here. */
export type ExtensionMissing =
  | { readonly kind: "absent" }
  | { readonly kind: "outdated"; readonly version: string };

export type MissingExtensionDialog = {
  readonly open: boolean;
  readonly refusal: ExtensionMissing;
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

async function checkExtension(): Promise<Result<void, ExtensionMissing>> {
  const status = await extensionBridge.probe();
  if (status.kind === "ready") return Result.ok();
  return Result.err(
    status.kind === "outdated"
      ? { kind: "outdated", version: status.extensionVersion }
      : { kind: "absent" },
  );
}

/** Asks for the extension before an Item Refresh. A refusal opens the notice that says why. */
export async function requireExtension(): Promise<Result<void, ExtensionMissing>> {
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
    let ready: Result<void, ExtensionMissing>;
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
