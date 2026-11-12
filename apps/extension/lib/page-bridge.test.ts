import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { BRIDGE_CHANNEL, BRIDGE_PROTOCOL } from "@myakiba/mfc/bridge";
import { Panic } from "better-result";
import type { BridgeEventMessage, PortEvent, PortRequest } from "@myakiba/mfc/bridge";
import { ORIGINS } from "../test/fake-browser";
import { KEEPALIVE_MS, startPageBridge } from "./page-bridge";
import type { BridgePort, PageWindow } from "./page-bridge";

const REQUEST_ID = "6f1c1f43-1e5b-4c39-9df5-5b0c2a3e8b11";
const OTHER_REQUEST_ID = "0b6c1d0e-55aa-4a4e-9a51-0c2b8b1c7e02";
const INVALIDATED = "Extension context invalidated.";

const consoleWarn = spyOn(console, "warn").mockImplementation(() => {});

afterEach(() => {
  consoleWarn.mockClear();
});

type PageRequest = { readonly [key: string]: string | readonly number[] };
type Json = string | number | boolean | null | readonly Json[] | { readonly [key: string]: Json };

function fakePage() {
  const posted: BridgeEventMessage[] = [];
  const transfers: Transferable[][] = [];
  let listener: Parameters<PageWindow["addEventListener"]>[1] = () => {};
  const page: PageWindow = {
    addEventListener: (_type, added) => {
      listener = added;
    },
    postMessage: (message, _targetOrigin, transfer) => {
      posted.push(message);
      transfers.push(transfer);
    },
  };
  return {
    page,
    posted,
    transfers,
    send: (request: PageRequest, requestId = REQUEST_ID) =>
      listener({
        source: page,
        origin: ORIGINS.web,
        data: { channel: BRIDGE_CHANNEL, protocol: BRIDGE_PROTOCOL, requestId, request },
      }),
  };
}

function fakeRuntime() {
  let invalidated = false;
  let portDefect: Error | null = null;
  const sent: PortRequest[] = [];
  const disconnects: (() => void)[] = [];
  const receivers: ((message: PortEvent) => void)[] = [];
  const ticks: (() => void)[] = [];
  const guard = () => {
    if (invalidated) throw new Error(INVALIDATED);
  };
  const runtime = {
    connect: (): BridgePort => {
      guard();
      return {
        postMessage: (message) => {
          if (portDefect) throw portDefect;
          guard();
          sent.push(message);
        },
        onMessage: { addListener: (listener) => receivers.push(listener) },
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
    breakPort: (defect: Error | null) => {
      portDefect = defect;
    },
    receive: (message: Json) => {
      for (const receiver of receivers) receiver(message as PortEvent);
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

  test("a reloaded extension's error is logged once as the reason the bridge detached", () => {
    const bridge = start();
    bridge.send({ type: "fetch-items", mfcItemIds: [1] });

    bridge.extension.invalidate();
    bridge.extension.ticks[0]?.();
    bridge.send({ type: "fetch-items", mfcItemIds: [2] }, OTHER_REQUEST_ID);

    expect(consoleWarn).toHaveBeenCalledTimes(1);
    expect(String(consoleWarn.mock.calls[0]?.[0])).toStartWith(
      `ExtensionContextInvalidated: The extension's runtime threw ${INVALIDATED}`,
    );
  });

  test("any other error from the port is a defect that panics and leaves the bridge attached", () => {
    const bridge = start();
    const defect = new TypeError("Cannot read properties of undefined (reading 'requestId')");
    bridge.extension.breakPort(defect);

    let thrown: unknown;
    try {
      bridge.send({ type: "fetch-items", mfcItemIds: [1] });
    } catch (error) {
      thrown = error;
    }
    let cause = thrown;
    while (Panic.is(cause) && Panic.is(cause.cause)) cause = cause.cause;
    expect(Panic.is(cause) && cause.cause).toBe(defect);

    bridge.extension.breakPort(null);
    bridge.send({ type: "hello" }, OTHER_REQUEST_ID);
    bridge.extension.ticks[0]?.();

    expect(bridge.posted).not.toContainEqual(interrupted(REQUEST_ID));
    expect(announced(bridge.posted, OTHER_REQUEST_ID)).toBe(true);
    expect(bridge.extension.sent.map((request) => request.type)).toEqual(["keepalive"]);
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  test("any error once the runtime reports itself gone detaches the bridge", () => {
    const bridge = start();
    bridge.send({ type: "fetch-items", mfcItemIds: [1] });

    bridge.extension.invalidate();
    bridge.extension.breakPort(new TypeError("Cannot read properties of undefined (reading 'id')"));
    bridge.extension.ticks[0]?.();

    expect(bridge.posted.slice(1)).toEqual([interrupted(REQUEST_ID)]);
    expect(bridge.extension.ticks).toEqual([]);
    expect(consoleWarn).toHaveBeenCalledTimes(1);
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

describe("relaying the background's events", () => {
  function running() {
    const bridge = start();
    bridge.send({ type: "fetch-items", mfcItemIds: [1, 2, 3] });
    bridge.posted.length = 0;
    bridge.transfers.length = 0;
    return bridge;
  }

  test("posts each kind of event to the page as the wire carries it", () => {
    const bridge = running();
    const events: Json[] = [
      { type: "status", state: "needs_user", mfcItemId: 1, untilMs: 5000 },
      {
        type: "item",
        mfcItemId: 1,
        result: { status: "ok", value: { html: "<html>1</html>", picture: null } },
      },
      {
        type: "item",
        mfcItemId: 2,
        result: { status: "error", error: { code: "hidden_or_missing" } },
      },
      { type: "done", reason: "complete" },
    ];
    for (const event of events) bridge.extension.receive({ requestId: REQUEST_ID, event });

    expect<readonly unknown[]>(bridge.posted).toEqual(
      events.map((event) => ({ channel: BRIDGE_CHANNEL, requestId: REQUEST_ID, event })),
    );
    expect(bridge.transfers).toEqual([[], [], [], []]);
  });

  test("turns a picture's base64 into bytes it transfers to the page", () => {
    const bridge = running();
    bridge.extension.receive({
      requestId: REQUEST_ID,
      event: {
        type: "item",
        mfcItemId: 3,
        result: {
          status: "ok",
          value: {
            html: "<html>3</html>",
            picture: { base64: "/9j/2Q==", contentType: "image/jpeg" },
          },
        },
      },
    });

    const [message] = bridge.posted;
    const event = message?.event;
    if (event?.type !== "item" || event.result.status !== "ok" || !event.result.value.picture) {
      throw new Error("expected item 3 to reach the page with its picture");
    }
    const { html, picture } = event.result.value;
    expect(html).toBe("<html>3</html>");
    expect(picture.contentType).toBe("image/jpeg");
    expect(new Uint8Array(picture.bytes)).toEqual(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]));
    expect(bridge.transfers).toEqual([[picture.bytes]]);
    expect(bridge.transfers[0]?.[0]).toBe(picture.bytes);
  });

  test("drops an event the port should not carry", () => {
    const bridge = running();
    const malformed: Json[] = [
      { requestId: REQUEST_ID, event: { type: "item", mfcItemId: 1, result: { status: "ok" } } },
      {
        requestId: REQUEST_ID,
        event: {
          type: "item",
          mfcItemId: 1,
          result: { status: "error", error: { code: "solar_flare" } },
        },
      },
      {
        requestId: REQUEST_ID,
        event: { type: "item", mfcItemId: 1, result: { ok: false, error: "timeout" } },
      },
      { requestId: REQUEST_ID, event: { type: "teleport" } },
      { requestId: "1", event: { type: "done", reason: "complete" } },
      "done",
    ];
    for (const message of malformed) bridge.extension.receive(message);

    expect(bridge.posted).toEqual([]);
  });
});

describe("relaying picks", () => {
  test("passes each pick request to the background with its request id", () => {
    const bridge = start();
    bridge.send({ type: "take-picks" });
    bridge.send({ type: "picks-saved", mfcItemIds: [1, 2] }, OTHER_REQUEST_ID);
    bridge.send({ type: "picks-discarded", mfcItemIds: [3] });

    expect<readonly unknown[]>(bridge.extension.sent).toEqual([
      { type: "take-picks", requestId: REQUEST_ID },
      { type: "picks-saved", requestId: OTHER_REQUEST_ID, mfcItemIds: [1, 2] },
      { type: "picks-discarded", requestId: REQUEST_ID, mfcItemIds: [3] },
    ]);
    expect(bridge.extension.ticks).toEqual([]);
  });

  test("relays a saved acknowledgement of any number of picks", () => {
    const bridge = start();
    const many = Array.from({ length: 1500 }, (_, index) => index + 1);
    bridge.send({ type: "picks-saved", mfcItemIds: many });

    expect<readonly unknown[]>(bridge.extension.sent).toEqual([
      { type: "picks-saved", requestId: REQUEST_ID, mfcItemIds: many },
    ]);
  });

  test("hands the page its picks with each picture's base64 turned into bytes it transfers", () => {
    const bridge = start();
    bridge.send({ type: "take-picks" });
    bridge.posted.length = 0;
    bridge.transfers.length = 0;
    const pick = (id: number, picture: Json) => ({
      mfcItemId: id,
      title: null,
      pickedAt: 5,
      html: `<html>${id}</html>`,
      picture,
    });
    bridge.extension.receive({
      requestId: REQUEST_ID,
      event: {
        type: "picks",
        picks: [
          pick(1, { base64: "/9j/2Q==", contentType: "image/jpeg" }),
          pick(2, null),
          pick(3, { base64: "iVBO", contentType: "image/png" }),
        ],
      },
    });

    const [message] = bridge.posted;
    if (message?.event.type !== "picks") throw new Error("expected the picks to reach the page");
    const [first, second, third] = message.event.picks;
    expect(message.requestId).toBe(REQUEST_ID);
    expect(first?.html).toBe("<html>1</html>");
    expect(first?.picture?.contentType).toBe("image/jpeg");
    expect(new Uint8Array(first?.picture?.bytes ?? new ArrayBuffer(0))).toEqual(
      new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
    );
    expect(second?.picture).toBeNull();
    expect<readonly unknown[]>(bridge.transfers).toEqual([
      [first?.picture?.bytes, third?.picture?.bytes],
    ]);
  });

  test("drops a picks event the port should not carry", () => {
    const bridge = start();
    bridge.send({ type: "take-picks" });
    bridge.posted.length = 0;
    bridge.extension.receive({
      requestId: REQUEST_ID,
      event: { type: "picks", picks: [{ mfcItemId: 1, html: "<html>1</html>" }] },
    });

    expect(bridge.posted).toEqual([]);
  });

  test("a restarted worker interrupts an open pick request, and an answered one is not", () => {
    const bridge = start();
    bridge.send({ type: "take-picks" });
    bridge.send({ type: "picks-saved", mfcItemIds: [1] }, OTHER_REQUEST_ID);
    bridge.extension.receive({ requestId: REQUEST_ID, event: { type: "picks", picks: [] } });
    bridge.posted.length = 0;

    bridge.extension.disconnect();

    expect(bridge.posted).toEqual([interrupted(OTHER_REQUEST_ID)]);
  });

  test("a reloaded extension answers a pick request as interrupted", () => {
    const bridge = start();
    bridge.extension.invalidate();
    bridge.send({ type: "take-picks" });
    bridge.send({ type: "picks-discarded", mfcItemIds: [1] }, OTHER_REQUEST_ID);

    expect(bridge.posted.slice(1)).toEqual([
      interrupted(REQUEST_ID),
      interrupted(OTHER_REQUEST_ID),
    ]);
  });
});
