import {
  BRIDGE_CHANNEL,
  BRIDGE_PROTOCOL,
  bridgeRequestSchema,
  portEventSchema,
} from "@myakiba/mfc/bridge";
import type { BridgeEventMessage, PortEvent, PortRequest } from "@myakiba/mfc/bridge";
import { env } from "@myakiba/env/extension";
import { browser } from "wxt/browser";
import type { Browser } from "wxt/browser";
import { defineContentScript } from "wxt/utils/define-content-script";

const WEB_ORIGIN = env.WXT_WEB_ORIGIN;
/** Chrome stops an idle service worker after 30 s, and method C waits up to 120 s. */
const KEEPALIVE_MS = 20_000;

function post(message: BridgeEventMessage, transfer: Transferable[] = []): void {
  window.postMessage(message, WEB_ORIGIN, transfer);
}

function announce(requestId: string | null): void {
  post({
    channel: BRIDGE_CHANNEL,
    requestId,
    event: {
      type: "announce",
      extensionVersion: browser.runtime.getManifest().version,
      protocols: { min: BRIDGE_PROTOCOL, max: BRIDGE_PROTOCOL },
    },
  });
}

function relay({ requestId, event }: PortEvent): void {
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

export default defineContentScript({
  matches: [`${WEB_ORIGIN}/*`],
  runAt: "document_start",
  allFrames: false,
  main() {
    const openRuns = new Set<string>();
    let port: Browser.runtime.Port | null = null;
    let keepalive: ReturnType<typeof setInterval> | undefined;

    function settle(requestId: string): void {
      openRuns.delete(requestId);
      if (openRuns.size === 0) clearInterval(keepalive);
    }

    function ensurePort(): void {
      if (port) return;
      port = browser.runtime.connect({ name: "myakiba-bridge" });
      port.onMessage.addListener((message) => {
        const parsed = portEventSchema.safeParse(message);
        if (!parsed.success) return;
        if (parsed.data.event.type === "done") settle(parsed.data.requestId);
        relay(parsed.data);
      });
      port.onDisconnect.addListener(() => {
        port = null;
        for (const requestId of openRuns) {
          settle(requestId);
          post({
            channel: BRIDGE_CHANNEL,
            requestId,
            event: { type: "done", reason: "interrupted" },
          });
        }
      });
    }

    window.addEventListener("message", (event) => {
      if (event.source !== window || event.origin !== WEB_ORIGIN) return;
      const parsed = bridgeRequestSchema.safeParse(event.data);
      if (!parsed.success) return;
      const { requestId, request } = parsed.data;
      switch (request.type) {
        case "hello":
          announce(requestId);
          return;
        case "fetch-items":
          if (openRuns.size === 0) {
            keepalive = setInterval(
              () => port?.postMessage({ type: "keepalive" } satisfies PortRequest),
              KEEPALIVE_MS,
            );
          }
          openRuns.add(requestId);
          ensurePort();
          port?.postMessage({
            type: "fetch-items",
            requestId,
            mfcItemIds: request.mfcItemIds,
          } satisfies PortRequest);
          return;
        case "cancel":
          port?.postMessage({
            type: "cancel",
            targetRequestId: request.targetRequestId,
          } satisfies PortRequest);
          break;
      }
    });
    announce(null);
  },
});
