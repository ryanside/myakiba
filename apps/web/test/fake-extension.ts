import { BRIDGE_CHANNEL, BRIDGE_PROTOCOL, bridgeRequestSchema } from "@myakiba/mfc/bridge";
import type { BridgeRequestMessage, BridgeWindow, ExtensionBridge } from "@/lib/extension-bridge";

export const PAGE_ORIGIN = "http://localhost:3001";

type MessageListener = Parameters<BridgeWindow["addEventListener"]>[1];

type LooseWireEvent = {
  readonly type: string;
  readonly mfcItemId?: number | null;
  readonly result?: {
    readonly status: string;
    readonly value?: {
      readonly html?: string;
      readonly picture?: { readonly bytes: ArrayBuffer; readonly contentType: string } | null;
    };
    readonly error?: { readonly code: string } | string;
  };
  readonly state?: string;
  readonly untilMs?: number | null;
  readonly reason?: string;
  readonly extensionVersion?: string;
  readonly protocols?: { readonly min: number; readonly max: number };
  readonly picks?: readonly FakePick[];
};

export type FakePick = {
  readonly mfcItemId: number;
  readonly title: string | null;
  readonly pickedAt: number;
  readonly html: string;
  readonly picture: { readonly bytes: ArrayBuffer; readonly contentType: string } | null;
};

export const fakePick = (
  mfcItemId: number,
  title: string | null = `Item ${mfcItemId}`,
): FakePick => ({
  mfcItemId,
  title,
  pickedAt: 1_700_000_000_000 + mfcItemId,
  html: `<html>${mfcItemId}</html>`,
  picture: null,
});

type Acknowledgement = {
  readonly type: "picks-saved" | "picks-discarded";
  readonly mfcItemIds: readonly number[];
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
  protocols = { min: BRIDGE_PROTOCOL, max: BRIDGE_PROTOCOL },
  onFetch = (run: FakeRun) => {
    for (const id of run.mfcItemIds) run.item(id);
    run.done("complete");
  },
  picks: initialPicks = [],
  answersPicks = true,
  onTake = () => {},
}: {
  readonly installed?: boolean;
  readonly protocols?: { readonly min: number; readonly max: number };
  readonly onFetch?: (run: FakeRun) => void;
  readonly picks?: readonly FakePick[];
  /** False keeps the extension silent about picks, like a content script that never answers. */
  readonly answersPicks?: boolean;
  /** Runs as the extension receives a take, before the page reads its answer. */
  readonly onTake?: () => void;
} = {}) {
  let picks = [...initialPicks];
  const acknowledged: Acknowledgement[] = [];
  let takes = 0;
  let takesStopped = false;
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
    const send = (event: LooseWireEvent) => emit(requestId, event);
    if (request.type === "take-picks") {
      takes += 1;
      onTake();
      if (takesStopped) send({ type: "done", reason: "complete" });
      else if (answersPicks) send({ type: "picks", picks });
      return;
    }
    if (request.type === "picks-saved" || request.type === "picks-discarded") {
      acknowledged.push({ type: request.type, mfcItemIds: request.mfcItemIds });
      const answered = new Set<number>(request.mfcItemIds);
      picks = picks.filter((pick) => !answered.has(pick.mfcItemId));
      if (answersPicks) send({ type: "done", reason: "complete" });
      return;
    }
    if (request.type !== "fetch-items") return;
    const run: FakeRun = {
      requestId,
      mfcItemIds: request.mfcItemIds,
      send,
      item: (mfcItemId, html = `<html>${mfcItemId}</html>`) =>
        send({ type: "item", mfcItemId, result: { status: "ok", value: { html, picture: null } } }),
      fail: (mfcItemId, code) =>
        send({ type: "item", mfcItemId, result: { status: "error", error: { code } } }),
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

  return {
    window,
    posted,
    runs,
    cancelled,
    deliver,
    emit,
    announce,
    setInstalled,
    acknowledged,
    picks: () => picks,
    setPicks: (next: readonly FakePick[]) => {
      picks = [...next];
    },
    stopTakes: (stopped: boolean) => {
      takesStopped = stopped;
    },
    takes: () => takes,
  };
}

export function delegatingBridge(current: () => ExtensionBridge): ExtensionBridge {
  return {
    status: () => current().status(),
    subscribe: (listener) => current().subscribe(listener),
    probe: () => current().probe(),
    fetchItems: (mfcItemIds, options) => current().fetchItems(mfcItemIds, options),
    takePicks: () => current().takePicks(),
    picksSaved: (mfcItemIds) => current().picksSaved(mfcItemIds),
    picksDiscarded: (mfcItemIds) => current().picksDiscarded(mfcItemIds),
  };
}
