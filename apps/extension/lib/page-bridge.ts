import {
  BRIDGE_CHANNEL,
  BRIDGE_PROTOCOL,
  bridgeRequestSchema,
  pageItemCodec,
  portEventSchema,
  portItemCodec,
} from "@myakiba/mfc/bridge";
import type { BridgeEventMessage, PortEvent, PortRequest } from "@myakiba/mfc/bridge";
import { Result, panic } from "better-result";
import { ExtensionContextInvalidated } from "./errors/extension-context-invalidated";
import { summarize } from "./errors/summary";

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

/** What Chrome's runtime throws from each call once the extension reloads or is removed under the page. */
const CONTEXT_INVALIDATED = "Extension context invalidated.";

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

  /**
   * How a runtime call fails once the extension left the page: Chrome throws its context-loss error, or the runtime
   * reports itself gone. Any other throw is a defect, so it panics and the bridge stays attached.
   */
  function invalidated(call: string, cause: unknown): ExtensionContextInvalidated {
    if ((cause instanceof Error && cause.message === CONTEXT_INVALIDATED) || !runtime.alive()) {
      return new ExtensionContextInvalidated({ cause });
    }
    const { name, message } = summarize(cause);
    return panic(
      `The page bridge expects the runtime to throw only "${CONTEXT_INVALIDATED}", but ${call} threw ${name}: ${message} while the extension was alive.`,
      cause,
    );
  }

  /** The extension left the page, so the bridge says why in the page's console and detaches. */
  function lose(invalidation: ExtensionContextInvalidated): void {
    console.warn(`${invalidation._tag}: ${invalidation.message}`);
    detach();
  }

  function relay({ requestId, event }: PortEvent): void {
    if (event.type === "done") {
      openRuns.delete(requestId);
      stopKeepaliveIfIdle();
    }
    // No background sends picks yet; relaying them means turning each picture's base64 into transferred bytes.
    if (event.type === "picks") return;
    if (event.type !== "item") {
      post({ channel: BRIDGE_CHANNEL, requestId, event });
      return;
    }
    const result = pageItemCodec.serializeUnsafe(portItemCodec.deserializeUnsafe(event.result));
    const picture = result.status === "ok" ? result.value.picture : null;
    post(
      { channel: BRIDGE_CHANNEL, requestId, event: { ...event, result } },
      picture ? [picture.bytes] : [],
    );
  }

  function connect(): BridgePort {
    const opened = runtime.connect();
    opened.onMessage.addListener((message) => {
      // The port codec panics on a result it cannot read, so a malformed event is dropped here first.
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
    const sent = Result.try({
      try: () => {
        port ??= connect();
        port.postMessage(request);
      },
      catch: (cause) => invalidated("sending a request to the background", cause),
    });
    if (sent.isErr()) lose(sent.error);
  }

  function announce(requestId: string | null): void {
    const extensionVersion = Result.try({
      try: () => runtime.version(),
      catch: (cause) => invalidated("reading the extension's version", cause),
    });
    if (extensionVersion.isErr()) {
      lose(extensionVersion.error);
      return;
    }
    post({
      channel: BRIDGE_CHANNEL,
      requestId,
      event: {
        type: "announce",
        extensionVersion: extensionVersion.value,
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
