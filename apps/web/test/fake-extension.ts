import { BRIDGE_CHANNEL, bridgeRequestSchema } from "@myakiba/mfc/bridge";
import type { BridgeRequestMessage, BridgeWindow, ExtensionBridge } from "@/lib/extension-bridge";

export const PAGE_ORIGIN = "http://localhost:3001";

type MessageListener = Parameters<BridgeWindow["addEventListener"]>[1];

type LooseWireEvent = {
  readonly type: string;
  readonly mfcItemId?: number | null;
  readonly result?: {
    readonly ok: boolean;
    readonly html?: string;
    readonly error?: string;
    readonly picture?: { readonly bytes: ArrayBuffer; readonly contentType: string } | null;
  };
  readonly state?: string;
  readonly untilMs?: number | null;
  readonly reason?: string;
  readonly extensionVersion?: string;
  readonly protocols?: { readonly min: number; readonly max: number };
};
type WireMessage =
  | BridgeRequestMessage
  | { readonly channel: string; readonly requestId: string | null; readonly event: LooseWireEvent };

export type FakeRun = {
  readonly requestId: string;
  readonly mfcItemIds: readonly number[];
  readonly send: (event: LooseWireEvent) => void;
  readonly item: (mfcItemId: number, html?: string) => void;
  readonly fail: (mfcItemId: number, error: string) => void;
  readonly status: (state: string, mfcItemId?: number | null) => void;
  readonly done: (reason: string) => void;
};

export function fakeExtension({
  installed: initiallyInstalled = true,
  protocols = { min: 1, max: 1 },
  onFetch = (run: FakeRun) => {
    for (const id of run.mfcItemIds) run.item(id);
    run.done("complete");
  },
}: {
  readonly installed?: boolean;
  readonly protocols?: { readonly min: number; readonly max: number };
  readonly onFetch?: (run: FakeRun) => void;
} = {}) {
  const listeners = new Set<MessageListener>();
  const posted: { readonly message: BridgeRequestMessage; readonly targetOrigin: string }[] = [];
  const runs: FakeRun[] = [];
  const cancelled: string[] = [];
  let installed = initiallyInstalled;

  const window: BridgeWindow = {
    location: { origin: PAGE_ORIGIN },
    addEventListener: (_type, listener) => {
      listeners.add(listener);
    },
    postMessage: (message, targetOrigin) => {
      posted.push({ message, targetOrigin });
      if (installed && message.request.type === "cancel") {
        cancelled.push(message.request.targetRequestId);
      }
      setTimeout(() => {
        deliver(message);
        if (installed) answer(message);
      }, 0);
    },
  };

  function deliver(
    data: WireMessage,
    { source = window, origin = PAGE_ORIGIN }: { source?: unknown; origin?: string } = {},
  ) {
    for (const listener of listeners) listener({ source, origin, data });
  }

  const emit = (requestId: string | null, event: LooseWireEvent) =>
    deliver({ channel: BRIDGE_CHANNEL, requestId, event });

  const announce = (requestId: string | null) =>
    emit(requestId, { type: "announce", extensionVersion: "0.1.0", protocols });

  function answer(message: BridgeRequestMessage) {
    const parsed = bridgeRequestSchema.safeParse(message);
    if (!parsed.success) return;
    const { requestId, request } = parsed.data;
    if (request.type === "hello") announce(requestId);
    if (request.type !== "fetch-items") return;
    const send = (event: LooseWireEvent) => emit(requestId, event);
    const run: FakeRun = {
      requestId,
      mfcItemIds: request.mfcItemIds,
      send,
      item: (mfcItemId, html = `<html>${mfcItemId}</html>`) =>
        send({ type: "item", mfcItemId, result: { ok: true, html, picture: null } }),
      fail: (mfcItemId, error) => send({ type: "item", mfcItemId, result: { ok: false, error } }),
      status: (state, mfcItemId = null) =>
        send({ type: "status", state, mfcItemId, untilMs: null }),
      done: (reason) => send({ type: "done", reason }),
    };
    runs.push(run);
    onFetch(run);
  }

  const setInstalled = (next: boolean) => {
    installed = next;
  };

  return { window, posted, runs, cancelled, deliver, emit, announce, setInstalled };
}

export function delegatingBridge(current: () => ExtensionBridge): ExtensionBridge {
  return {
    status: () => current().status(),
    subscribe: (listener) => current().subscribe(listener),
    probe: () => current().probe(),
    fetchItems: (mfcItemIds, options) => current().fetchItems(mfcItemIds, options),
  };
}
