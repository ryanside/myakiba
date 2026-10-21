import { portRequestSchema } from "@myakiba/mfc/bridge";
import type { PortEvent, PortRequest } from "@myakiba/mfc/bridge";
import type { Fetcher } from "./fetcher";
import type { RunKey } from "./queue";

export type PortSender = {
  readonly id?: string;
  readonly frameId?: number;
  readonly origin?: string;
  readonly url?: string;
  readonly tab?: { readonly id?: number };
};

export type BridgePort = {
  readonly sender?: PortSender;
  readonly postMessage: (message: PortEvent) => void;
  readonly disconnect: () => void;
  readonly onMessage: { readonly addListener: (listener: (message: PortRequest) => void) => void };
  readonly onDisconnect: { readonly addListener: (listener: () => void) => void };
};

function trustedTabId(
  sender: PortSender | undefined,
  expected: { readonly extensionId: string; readonly webOrigin: string },
): number | null {
  if (sender?.id !== expected.extensionId || sender.frameId !== 0) return null;
  // Firefox gives no sender.origin.
  const origin = sender.origin ?? URL.parse(sender.url ?? "")?.origin;
  return origin === expected.webOrigin ? (sender.tab?.id ?? null) : null;
}

export function servePort(
  port: BridgePort,
  fetcher: Pick<Fetcher, "submit" | "cancel">,
  expected: { readonly extensionId: string; readonly webOrigin: string },
): void {
  const requesterTabId = trustedTabId(port.sender, expected);
  if (requesterTabId === null) {
    port.disconnect();
    return;
  }
  const portKey = crypto.randomUUID();
  const runKey = (requestId: string) => `${portKey}/${requestId}` as RunKey;
  const openRuns = new Set<RunKey>();
  let connected = true;

  port.onDisconnect.addListener(() => {
    connected = false;
    for (const key of openRuns) fetcher.cancel(key);
  });
  port.onMessage.addListener((message) => {
    const parsed = portRequestSchema.safeParse(message);
    if (!parsed.success) return;
    const request = parsed.data;
    switch (request.type) {
      case "fetch-items": {
        const key = runKey(request.requestId);
        openRuns.add(key);
        fetcher.submit({
          key,
          requesterTabId,
          mfcItemIds: request.mfcItemIds,
          emit: (event) => {
            if (event.type === "done") openRuns.delete(key);
            if (connected) port.postMessage({ requestId: request.requestId, event });
          },
        });
        break;
      }
      case "cancel":
        fetcher.cancel(runKey(request.targetRequestId));
        break;
      case "keepalive":
        break;
    }
  });
}
