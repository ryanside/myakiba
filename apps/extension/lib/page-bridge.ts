import {
  BRIDGE_CHANNEL,
  BRIDGE_PROTOCOL,
  bridgeRequestSchema,
  portEventSchema,
} from "@myakiba/mfc/bridge";
import type { BridgeEventMessage, PortEvent, PortRequest } from "@myakiba/mfc/bridge";

/** Chrome stops an idle service worker after 30 s, and a challenge waits up to 120 s. */
export const KEEPALIVE_MS = 20_000;

type PageMessage = { readonly source: unknown; readonly origin: string; readonly data: unknown };

export type PageWindow = {
  readonly addEventListener: (type: "message", listener: (event: PageMessage) => void) => void;
  readonly postMessage: (
    message: BridgeEventMessage,
    targetOrigin: string,
    transfer: Transferable[],
  ) => void;
};

export type BridgePort = {
  readonly postMessage: (message: PortRequest) => void;
  readonly onMessage: { readonly addListener: (listener: (message: PortEvent) => void) => void };
  readonly onDisconnect: { readonly addListener: (listener: () => void) => void };
};

/** Each call throws "Extension context invalidated" once the extension reloads under the page. */
export type BridgeRuntime = {
  readonly connect: () => BridgePort;
  readonly version: () => string;
  readonly alive: () => boolean;
};

/** Relays the page's requests to the background and the background's events to the page. */
export function startPageBridge(deps: {
  readonly page: PageWindow;
  readonly origin: string;
  readonly runtime: BridgeRuntime;
  /** Calls `tick` every `ms` until the returned function stops it. */
  readonly repeat: (ms: number, tick: () => void) => () => void;
}): void {
  const { page, origin, runtime } = deps;
  const openRuns = new Set<string>();
  let port: BridgePort | null = null;
  let stopKeepalive: (() => void) | null = null;
  let detached = false;

  function post(message: BridgeEventMessage, transfer: Transferable[] = []): void {
    page.postMessage(message, origin, transfer);
  }

  function interrupt(requestId: string): void {
    post({ channel: BRIDGE_CHANNEL, requestId, event: { type: "done", reason: "interrupted" } });
  }

  function stopKeepaliveIfIdle(): void {
    if (openRuns.size > 0) return;
    stopKeepalive?.();
    stopKeepalive = null;
  }

  function interruptAll(): void {
    port = null;
    const interrupted = [...openRuns];
    openRuns.clear();
    stopKeepaliveIfIdle();
    for (const requestId of interrupted) interrupt(requestId);
  }

  function detach(): void {
    detached = true;
    interruptAll();
  }

  function relay({ requestId, event }: PortEvent): void {
    if (event.type === "done") {
      openRuns.delete(requestId);
      stopKeepaliveIfIdle();
    }
    if (event.type !== "item") {
      post({ channel: BRIDGE_CHANNEL, requestId, event });
      return;
    }
    const { result } = event;
    if (!result.ok || !result.picture) {
      post({
        channel: BRIDGE_CHANNEL,
        requestId,
        event: { ...event, result: result.ok ? { ...result, picture: null } : result },
      });
      return;
    }
    const bytes = Uint8Array.fromBase64(result.picture.base64).buffer;
    const picture = { bytes, contentType: result.picture.contentType };
    post(
      { channel: BRIDGE_CHANNEL, requestId, event: { ...event, result: { ...result, picture } } },
      [bytes],
    );
  }

  function connect(): BridgePort {
    const opened = runtime.connect();
    opened.onMessage.addListener((message) => {
      const parsed = portEventSchema.safeParse(message);
      if (parsed.success) relay(parsed.data);
    });
    opened.onDisconnect.addListener(() => {
      if (port !== opened) return;
      if (runtime.alive()) interruptAll();
      else detach();
    });
    return opened;
  }

  function send(request: PortRequest): void {
    try {
      port ??= connect();
      port.postMessage(request);
    } catch {
      detach();
    }
  }

  function announce(requestId: string | null): void {
    let extensionVersion: string;
    try {
      extensionVersion = runtime.version();
    } catch {
      detach();
      return;
    }
    post({
      channel: BRIDGE_CHANNEL,
      requestId,
      event: {
        type: "announce",
        extensionVersion,
        protocols: { min: BRIDGE_PROTOCOL, max: BRIDGE_PROTOCOL },
      },
    });
  }

  page.addEventListener("message", (event) => {
    if (event.source !== page || event.origin !== origin) return;
    const parsed = bridgeRequestSchema.safeParse(event.data);
    if (!parsed.success) return;
    const { requestId, request } = parsed.data;
    switch (request.type) {
      case "hello":
        if (!detached) announce(requestId);
        return;
      case "fetch-items":
        if (detached) {
          interrupt(requestId);
          return;
        }
        openRuns.add(requestId);
        stopKeepalive ??= deps.repeat(KEEPALIVE_MS, () => {
          send({ type: "keepalive" });
        });
        send({ type: "fetch-items", requestId, mfcItemIds: request.mfcItemIds });
        return;
      case "cancel":
        if (!detached) send({ type: "cancel", targetRequestId: request.targetRequestId });
    }
  });
  announce(null);
}
