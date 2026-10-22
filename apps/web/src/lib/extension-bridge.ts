import type * as z from "zod";
import {
  BRIDGE_CHANNEL,
  BRIDGE_PROTOCOL,
  MAX_ITEMS_PER_REQUEST,
  bridgeEventSchema,
} from "@myakiba/mfc/bridge";
import type { ItemError, bridgeRequestSchema } from "@myakiba/mfc/bridge";
import type { MfcItemId } from "@myakiba/mfc/page";

const HELLO_TIMEOUT_MS = 500;
const HELLO_INTERVAL_MS = 100;

export type ExtensionStatus =
  | { readonly kind: "checking" }
  | { readonly kind: "absent" }
  | { readonly kind: "outdated"; readonly extensionVersion: string }
  | { readonly kind: "ready"; readonly extensionVersion: string };

type FetchItemError = ItemError | "unknown" | "extension_stopped";

export type ExtensionFetchEvent =
  | {
      readonly type: "item";
      readonly mfcItemId: MfcItemId;
      readonly result:
        | { readonly ok: true; readonly html: string; readonly picture: Blob | null }
        | { readonly ok: false; readonly error: FetchItemError };
    }
  | {
      readonly type: "status";
      readonly state: "queued" | "fetching" | "needs_user" | "backing_off" | "unknown";
      readonly untilMs: number | null;
    };

export type ExtensionBridge = {
  readonly status: () => ExtensionStatus;
  readonly subscribe: (listener: () => void) => () => void;
  readonly probe: () => Promise<ExtensionStatus>;
  readonly fetchItems: (
    mfcItemIds: readonly MfcItemId[],
    options: { readonly signal: AbortSignal },
  ) => AsyncIterable<ExtensionFetchEvent>;
};

type BridgeMessageEvent = {
  readonly source: unknown;
  readonly origin: string;
  readonly data: unknown;
};

export type BridgeRequestMessage = z.input<typeof bridgeRequestSchema>;

export type BridgeWindow = {
  readonly location: { readonly origin: string };
  readonly addEventListener: (
    type: "message",
    listener: (event: BridgeMessageEvent) => void,
  ) => void;
  readonly postMessage: (message: BridgeRequestMessage, targetOrigin: string) => void;
};

type ReceivedEvent = z.output<typeof bridgeEventSchema>["event"];
type RunEvent = Exclude<ReceivedEvent, { readonly type: "announce" }>;

function statusFromAnnounce(
  announce: Extract<ReceivedEvent, { type: "announce" }>,
): ExtensionStatus {
  const { extensionVersion, protocols } = announce;
  return protocols.min <= BRIDGE_PROTOCOL && BRIDGE_PROTOCOL <= protocols.max
    ? { kind: "ready", extensionVersion }
    : { kind: "outdated", extensionVersion };
}

function chunk<T>(values: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < values.length; start += size) {
    chunks.push(values.slice(start, start + size));
  }
  return chunks;
}

export function createExtensionBridge(win: BridgeWindow): ExtensionBridge {
  const origin = win.location.origin;
  const listeners = new Set<() => void>();
  const runs = new Map<string, (event: RunEvent) => void>();
  let status: ExtensionStatus = { kind: "checking" };
  let probing: Promise<ExtensionStatus> | null = null;
  let answered: (() => void) | null = null;

  function setStatus(next: ExtensionStatus): void {
    status = next;
    for (const listener of listeners) listener();
  }

  function post(requestId: string, request: BridgeRequestMessage["request"]): void {
    win.postMessage(
      { channel: BRIDGE_CHANNEL, protocol: BRIDGE_PROTOCOL, requestId, request },
      origin,
    );
  }

  win.addEventListener("message", (message) => {
    if (message.source !== win || message.origin !== origin) return;
    const decoded = bridgeEventSchema.safeParse(message.data);
    if (!decoded.success) return;
    const { requestId, event } = decoded.data;
    if (event.type === "announce") {
      setStatus(statusFromAnnounce(event));
      answered?.();
      return;
    }
    if (requestId !== null) runs.get(requestId)?.(event);
  });

  function probe(): Promise<ExtensionStatus> {
    probing ??= new Promise((resolve) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = (next: ExtensionStatus | null) => {
        clearTimeout(timer);
        answered = null;
        probing = null;
        if (next) setStatus(next);
        resolve(status);
      };
      answered = () => finish(null);
      const deadline = Date.now() + HELLO_TIMEOUT_MS;
      const hello = () => {
        if (Date.now() >= deadline) {
          finish({ kind: "absent" });
          return;
        }
        post(crypto.randomUUID(), { type: "hello" });
        timer = setTimeout(hello, HELLO_INTERVAL_MS);
      };
      hello();
    });
    return probing;
  }

  async function* fetchBatch(
    mfcItemIds: readonly MfcItemId[],
    signal: AbortSignal,
  ): AsyncGenerator<ExtensionFetchEvent> {
    const unanswered = new Set(mfcItemIds);
    const inbox: RunEvent[] = [];
    let wake: (() => void) | null = null;
    const nextEvent = async (): Promise<RunEvent | undefined> => {
      if (inbox.length === 0 && !signal.aborted) {
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
        wake = null;
      }
      return inbox.shift();
    };
    const requestId = crypto.randomUUID();
    runs.set(requestId, (event) => {
      inbox.push(event);
      wake?.();
    });
    const onAbort = () => {
      post(crypto.randomUUID(), { type: "cancel", targetRequestId: requestId });
      wake?.();
    };
    signal.addEventListener("abort", onAbort, { once: true });
    try {
      if (!signal.aborted) post(requestId, { type: "fetch-items", mfcItemIds: [...mfcItemIds] });
      while (unanswered.size > 0 && !signal.aborted) {
        const event = await nextEvent();
        if (event === undefined) continue;
        if (event.type === "done") break;
        if (event.type === "status") {
          yield { type: "status", state: event.state, untilMs: event.untilMs };
        } else if (event.type === "item" && unanswered.delete(event.mfcItemId)) {
          const { result } = event;
          const picture =
            result.ok && result.picture
              ? new Blob([result.picture.bytes], { type: result.picture.contentType })
              : null;
          yield {
            type: "item",
            mfcItemId: event.mfcItemId,
            result: result.ok ? { ok: true, html: result.html, picture } : result,
          };
        }
      }
    } finally {
      runs.delete(requestId);
      signal.removeEventListener("abort", onAbort);
    }
    for (const mfcItemId of unanswered) {
      yield { type: "item", mfcItemId, result: { ok: false, error: "extension_stopped" } };
    }
  }

  return {
    status: () => status,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    probe,
    async *fetchItems(mfcItemIds, { signal }) {
      for (const batch of chunk([...new Set(mfcItemIds)], MAX_ITEMS_PER_REQUEST)) {
        yield* fetchBatch(batch, signal);
      }
    },
  };
}

export const extensionBridge = createExtensionBridge(window);
