import { describe, expect, test } from "bun:test";
import { BRIDGE_CHANNEL } from "@myakiba/mfc/bridge";
import type { BridgeEventMessage, PortRequest } from "@myakiba/mfc/bridge";
import { ORIGINS } from "../test/fake-browser";
import { KEEPALIVE_MS, startPageBridge } from "./page-bridge";
import type { BridgePort, PageWindow } from "./page-bridge";

const REQUEST_ID = "6f1c1f43-1e5b-4c39-9df5-5b0c2a3e8b11";
const OTHER_REQUEST_ID = "0b6c1d0e-55aa-4a4e-9a51-0c2b8b1c7e02";
const INVALIDATED = "Extension context invalidated.";

type PageRequest = { readonly [key: string]: string | readonly number[] };

function fakePage() {
  const posted: BridgeEventMessage[] = [];
  let listener: Parameters<PageWindow["addEventListener"]>[1] = () => {};
  const page: PageWindow = {
    addEventListener: (_type, added) => {
      listener = added;
    },
    postMessage: (message) => posted.push(message),
  };
  return {
    page,
    posted,
    send: (request: PageRequest, requestId = REQUEST_ID) =>
      listener({
        source: page,
        origin: ORIGINS.web,
        data: { channel: BRIDGE_CHANNEL, protocol: 1, requestId, request },
      }),
  };
}

function fakeRuntime() {
  let invalidated = false;
  const sent: PortRequest[] = [];
  const disconnects: (() => void)[] = [];
  const ticks: (() => void)[] = [];
  const guard = () => {
    if (invalidated) throw new Error(INVALIDATED);
  };
  const runtime = {
    connect: (): BridgePort => {
      guard();
      return {
        postMessage: (message) => {
          guard();
          sent.push(message);
        },
        onMessage: { addListener: () => {} },
        onDisconnect: { addListener: (listener) => disconnects.push(listener) },
      };
    },
    version: () => {
      guard();
      return "0.1.0";
    },
    alive: () => !invalidated,
  };
  return {
    runtime,
    sent,
    ticks,
    repeat: (ms: number, tick: () => void) => {
      expect(ms).toBe(KEEPALIVE_MS);
      ticks.push(tick);
      return () => {
        ticks.splice(ticks.indexOf(tick), 1);
      };
    },
    invalidate: () => {
      invalidated = true;
    },
    disconnect: () => {
      for (const listener of disconnects) listener();
    },
  };
}

function start() {
  const page = fakePage();
  const extension = fakeRuntime();
  startPageBridge({
    page: page.page,
    origin: ORIGINS.web,
    runtime: extension.runtime,
    repeat: extension.repeat,
  });
  return { ...page, extension };
}

function announced(posted: readonly BridgeEventMessage[], requestId: string | null): boolean {
  return posted.some(
    (message) => message.requestId === requestId && message.event.type === "announce",
  );
}

const interrupted = (requestId: string): BridgeEventMessage => ({
  channel: BRIDGE_CHANNEL,
  requestId,
  event: { type: "done", reason: "interrupted" },
});

describe("the page bridge", () => {
  test("announces itself on load and answers hello", () => {
    const bridge = start();
    bridge.send({ type: "hello" });

    expect(announced(bridge.posted, null)).toBe(true);
    expect(announced(bridge.posted, REQUEST_ID)).toBe(true);
  });

  test("a reloaded extension interrupts open runs, stops the keepalive and goes quiet", () => {
    const bridge = start();
    bridge.send({ type: "fetch-items", mfcItemIds: [1] });
    expect(bridge.extension.ticks).toHaveLength(1);

    bridge.extension.invalidate();
    bridge.extension.ticks[0]?.();
    bridge.posted.length = 0;
    bridge.send({ type: "hello" }, OTHER_REQUEST_ID);

    expect(bridge.extension.ticks).toEqual([]);
    expect(announced(bridge.posted, OTHER_REQUEST_ID)).toBe(false);
  });

  test("a reloaded extension's error ends each open run as interrupted", () => {
    const bridge = start();
    bridge.send({ type: "fetch-items", mfcItemIds: [1] });

    bridge.extension.invalidate();
    bridge.send({ type: "fetch-items", mfcItemIds: [2] }, OTHER_REQUEST_ID);

    expect(bridge.posted.slice(1)).toEqual([
      interrupted(REQUEST_ID),
      interrupted(OTHER_REQUEST_ID),
    ]);
  });

  test("a disconnect from a reloaded extension does the same", () => {
    const bridge = start();
    bridge.send({ type: "fetch-items", mfcItemIds: [1] });

    bridge.extension.invalidate();
    bridge.extension.disconnect();
    bridge.send({ type: "hello" }, OTHER_REQUEST_ID);

    expect(bridge.posted.slice(1)).toEqual([interrupted(REQUEST_ID)]);
    expect(bridge.extension.ticks).toEqual([]);
  });

  test("a restarted worker interrupts open runs and the next run reconnects", () => {
    const bridge = start();
    bridge.send({ type: "fetch-items", mfcItemIds: [1] });

    bridge.extension.disconnect();
    bridge.send({ type: "fetch-items", mfcItemIds: [2] }, OTHER_REQUEST_ID);
    bridge.send({ type: "hello" });

    expect(bridge.posted.slice(1, 2)).toEqual([interrupted(REQUEST_ID)]);
    expect(bridge.extension.sent.map((request) => request.type)).toEqual([
      "fetch-items",
      "fetch-items",
    ]);
    expect(announced(bridge.posted, REQUEST_ID)).toBe(true);
  });
});
