import { describe, expect, expectTypeOf, test } from "bun:test";
import type * as z from "zod";
import {
  BRIDGE_CHANNEL,
  BRIDGE_PROTOCOL,
  MAX_ITEMS_PER_REQUEST,
  bridgeEventSchema,
  bridgeRequestSchema,
  portEventSchema,
  portRequestSchema,
} from "./bridge";
import type { BridgeEventMessage, PortEvent } from "./bridge";
import { ITEM_FETCH_ERROR_CODES } from "@myakiba/contracts/sync/constants";
import { itemId } from "../test/fixtures";

const REQUEST_ID = "6f1c1f43-1e5b-4c39-9df5-5b0c2a3e8b11";

type Json = string | number | boolean | null | readonly Json[] | { readonly [key: string]: Json };
type WireMessage = { readonly [key: string]: Json };

function decodeBridgeRequest(message: WireMessage) {
  return bridgeRequestSchema.safeParse(message).data ?? null;
}

function decodeBridgeEvent(message: WireMessage | BridgeEventMessage | string) {
  return bridgeEventSchema.safeParse(message).data ?? null;
}

function request(body: WireMessage, overrides: WireMessage = {}) {
  return {
    channel: BRIDGE_CHANNEL,
    protocol: BRIDGE_PROTOCOL,
    requestId: REQUEST_ID,
    request: body,
    ...overrides,
  };
}

function event(body: WireMessage) {
  return { channel: BRIDGE_CHANNEL, requestId: REQUEST_ID, event: body };
}

describe("decodeBridgeRequest is strict", () => {
  test("accepts hello, fetch-items and cancel", () => {
    expect(decodeBridgeRequest(request({ type: "hello" }))?.request).toEqual({ type: "hello" });
    expect(
      decodeBridgeRequest(request({ type: "fetch-items", mfcItemIds: [98_777, 1] }))?.request,
    ).toEqual({ type: "fetch-items", mfcItemIds: [itemId(98_777), itemId(1)] });
    expect(
      decodeBridgeRequest(request({ type: "cancel", targetRequestId: REQUEST_ID }))?.request,
    ).toEqual({ type: "cancel", targetRequestId: REQUEST_ID });
  });

  test.each([
    ["a string id", ["98777"]],
    ["a float id", [1.5]],
    ["zero", [0]],
    ["an id past 2^31-1", [2 ** 31]],
    ["a URL", ["https://myfigurecollection.net/item/98777"]],
    ["duplicate ids", [98_777, 98_777]],
    ["no ids", []],
    ["too many ids", Array.from({ length: MAX_ITEMS_PER_REQUEST + 1 }, (_, index) => index + 1)],
  ])("rejects fetch-items with %s", (_, mfcItemIds) => {
    expect(decodeBridgeRequest(request({ type: "fetch-items", mfcItemIds }))).toBeNull();
  });

  test("rejects a URL request, extra keys, another channel and another protocol", () => {
    expect(
      decodeBridgeRequest(
        request({ type: "fetch-url", url: "https://myfigurecollection.net/item/1" }),
      ),
    ).toBeNull();
    expect(
      decodeBridgeRequest(
        request({ type: "fetch-items", mfcItemIds: [1], url: "https://example.com" }),
      ),
    ).toBeNull();
    expect(decodeBridgeRequest(request({ type: "hello" }, { channel: "other" }))).toBeNull();
    expect(decodeBridgeRequest(request({ type: "hello" }, { protocol: 2 }))).toBeNull();
    expect(decodeBridgeRequest(request({ type: "hello" }, { requestId: "1" }))).toBeNull();
    expect(decodeBridgeRequest(request({ type: "hello" }, { extra: true }))).toBeNull();
  });

  test("ignores the extension's own events posted on the same window", () => {
    expect(decodeBridgeRequest(event({ type: "done", reason: "complete" }))).toBeNull();
  });
});

describe("decodeBridgeEvent is lenient", () => {
  test("reads an item with picture bytes", () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff]).buffer;
    const message: BridgeEventMessage = {
      channel: BRIDGE_CHANNEL,
      requestId: REQUEST_ID,
      event: {
        type: "item",
        mfcItemId: itemId(98_777),
        result: { ok: true, html: "<html></html>", picture: { bytes, contentType: "image/jpeg" } },
      },
    };
    expect(decodeBridgeEvent(message)).toEqual(message);
  });

  test.each([...ITEM_FETCH_ERROR_CODES])("the error code %p reads as itself", (code) => {
    expect(
      decodeBridgeEvent(event({ type: "item", mfcItemId: 1, result: { ok: false, error: code } }))
        ?.event,
    ).toEqual({ type: "item", mfcItemId: itemId(1), result: { ok: false, error: code } });
  });

  test("an unknown error code, state or reason reads as unknown", () => {
    expect(
      decodeBridgeEvent(
        event({ type: "item", mfcItemId: 1, result: { ok: false, error: "new_code" } }),
      )?.event,
    ).toEqual({ type: "item", mfcItemId: itemId(1), result: { ok: false, error: "unknown" } });
    expect(
      decodeBridgeEvent(event({ type: "status", state: "new_state", mfcItemId: null, untilMs: 1 }))
        ?.event,
    ).toEqual({ type: "status", state: "unknown", mfcItemId: null, untilMs: 1 });
    expect(decodeBridgeEvent(event({ type: "done", reason: "new_reason" }))?.event).toEqual({
      type: "done",
      reason: "unknown",
    });
  });

  test("an unknown event type reads as unknown", () => {
    expect(decodeBridgeEvent(event({ type: "progress", percent: 50 }))?.event).toEqual({
      type: "unknown",
    });
  });

  test("an announce without a request id is the unprompted one", () => {
    const announce: BridgeEventMessage = {
      channel: BRIDGE_CHANNEL,
      requestId: null,
      event: { type: "announce", extensionVersion: "1.0.0", protocols: { min: 1, max: 1 } },
    };
    expect(decodeBridgeEvent(announce)).toEqual(announce);
  });

  test("anything not on the channel, and the page's own requests, are not events", () => {
    expect(
      decodeBridgeEvent({ ...event({ type: "done", reason: "complete" }), channel: "x" }),
    ).toBeNull();
    expect(decodeBridgeEvent(request({ type: "hello" }))).toBeNull();
    expect(decodeBridgeEvent("done")).toBeNull();
  });
});

describe("port messages inside the extension", () => {
  test("a request is strict and carries only ids", () => {
    expect(
      portRequestSchema.safeParse({ type: "fetch-items", requestId: REQUEST_ID, mfcItemIds: [1] })
        .success,
    ).toBe(true);
    expect(portRequestSchema.safeParse({ type: "keepalive" }).success).toBe(true);
    expect(
      portRequestSchema.safeParse({ type: "fetch-url", url: "https://myfigurecollection.net/" })
        .success,
    ).toBe(false);
  });

  test("an event carries the picture as base64", () => {
    const portEvent: PortEvent = {
      requestId: REQUEST_ID,
      event: {
        type: "item",
        mfcItemId: itemId(98_777),
        result: { ok: true, html: "<html></html>", picture: { base64: "/9j/", contentType: "" } },
      },
    };
    expect(portEventSchema.parse(portEvent)).toEqual(portEvent);
    expect(
      portEventSchema.safeParse({
        ...portEvent,
        event: { ...portEvent.event, result: { ok: true, html: "", picture: { base64: "%" } } },
      }).success,
    ).toBe(false);
  });

  test("the event schema and the event type agree", () => {
    type Agree<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
    expectTypeOf<Agree<z.output<typeof portEventSchema>, PortEvent>>().toEqualTypeOf<true>();
  });
});
