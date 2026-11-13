import { portItemCodec, portRequestSchema } from "@myakiba/mfc/bridge";
import type { PortEvent, PortPicture, PortRequest, RunEvent } from "@myakiba/mfc/bridge";
import type { Fetcher } from "./fetcher";
import type { Picks } from "./picks";
import type { Requester, RunKey } from "./queue";

export type PortSender = {
  readonly id?: string;
  readonly frameId?: number;
  readonly origin?: string;
  readonly url?: string;
  readonly tab?: {
    readonly id?: number;
    readonly incognito?: boolean;
    readonly cookieStoreId?: string;
  };
};

export type BridgePort = {
  readonly sender?: PortSender;
  readonly postMessage: (message: PortEvent) => void;
  readonly disconnect: () => void;
  readonly onMessage: { readonly addListener: (listener: (message: PortRequest) => void) => void };
  readonly onDisconnect: { readonly addListener: (listener: () => void) => void };
};

function trustedRequester(
  sender: PortSender | undefined,
  expected: { readonly extensionId: string; readonly webOrigin: string },
): Requester | null {
  if (sender?.id !== expected.extensionId || sender.frameId !== 0) return null;
  // Firefox gives no sender.origin.
  const origin = sender.origin ?? URL.parse(sender.url ?? "")?.origin;
  const tab = sender.tab;
  if (origin !== expected.webOrigin || tab?.id === undefined || tab.incognito === undefined) {
    return null;
  }
  return {
    tabId: tab.id,
    context: { incognito: tab.incognito, cookieStoreId: tab.cookieStoreId ?? null },
  };
}

function toPort(event: RunEvent<PortPicture>): PortEvent["event"] {
  return event.type === "item"
    ? { ...event, result: portItemCodec.serializeUnsafe(event.result) }
    : event;
}

export function servePort(
  port: BridgePort,
  fetcher: Pick<Fetcher, "submit" | "cancel">,
  picks: Pick<Picks, "read" | "settle">,
  expected: { readonly extensionId: string; readonly webOrigin: string },
): void {
  const requester = trustedRequester(port.sender, expected);
  if (requester === null) {
    port.disconnect();
    return;
  }
  const portKey = crypto.randomUUID();
  const runKey = (requestId: string) => `${portKey}/${requestId}` as RunKey;
  const openRuns = new Set<RunKey>();
  let connected = true;
  const answer = (event: PortEvent) => {
    if (connected) port.postMessage(event);
  };

  /** Hands the requester's context its picks. A store that will not read answers nothing, which the page reads as no picks. */
  const handOver = async (requestId: string): Promise<void> => {
    const read = await picks.read(requester.context);
    if (read.isErr()) {
      console.warn(`${read.error._tag}: ${read.error.message}`);
      return;
    }
    answer({ requestId, event: { type: "picks", picks: read.value } });
  };

  /** Deletes the captures the page saved or discarded. A delete that fails keeps them, so the page meets them again. */
  const forget = async (requestId: string, captureIds: readonly string[]): Promise<void> => {
    const removed = await picks.settle(requester.context, captureIds);
    if (removed.isErr()) console.warn(`${removed.error._tag}: ${removed.error.message}`);
    answer({
      requestId,
      event: { type: "done", reason: removed.isOk() ? "complete" : "interrupted" },
    });
  };

  port.onDisconnect.addListener(() => {
    connected = false;
    for (const key of openRuns) fetcher.cancel(key);
  });
  port.onMessage.addListener(async (message) => {
    const parsed = portRequestSchema.safeParse(message);
    if (!parsed.success) return;
    const request = parsed.data;
    switch (request.type) {
      case "fetch-items": {
        const key = runKey(request.requestId);
        openRuns.add(key);
        fetcher.submit({
          key,
          requester,
          mfcItemIds: request.mfcItemIds,
          emit: (event) => {
            if (event.type === "done") openRuns.delete(key);
            answer({ requestId: request.requestId, event: toPort(event) });
          },
        });
        break;
      }
      case "cancel":
        fetcher.cancel(runKey(request.targetRequestId));
        break;
      case "keepalive":
        break;
      case "take-picks":
        await handOver(request.requestId);
        break;
      case "picks-saved":
      case "picks-discarded":
        await forget(request.requestId, request.captureIds);
        break;
    }
  });
}
