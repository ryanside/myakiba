import { describe, expect, expectTypeOf, test } from "bun:test";
import { Panic, Result, ResultDeserializationError, ResultSerializationError } from "better-result";
import { parseJson } from "@myakiba/utils/parse-json";
import * as z from "zod";
import {
  BRIDGE_CHANNEL,
  BRIDGE_PROTOCOL,
  MAX_ITEMS_PER_REQUEST,
  bridgeEventSchema,
  bridgeRequestSchema,
  pageItemCodec,
  portEventSchema,
  portItemCodec,
  portRequestSchema,
} from "./bridge";
import type { BridgeEventMessage, PortEvent } from "./bridge";
import { MAX_PICK_TITLE } from "@myakiba/contracts/add/constants";
import { ITEM_FETCH_ERROR_CODES } from "@myakiba/contracts/mfc-items/fetch-errors";
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
    expect(decodeBridgeRequest(request({ type: "hello" }, { protocol: 1 }))).toBeNull();
    expect(decodeBridgeRequest(request({ type: "hello" }, { requestId: "1" }))).toBeNull();
    expect(decodeBridgeRequest(request({ type: "hello" }, { extra: true }))).toBeNull();
  });

  test("accepts take-picks, picks-saved and picks-discarded", () => {
    expect(decodeBridgeRequest(request({ type: "take-picks" }))?.request).toEqual({
      type: "take-picks",
    });
    for (const type of ["picks-saved", "picks-discarded"] as const) {
      expect(decodeBridgeRequest(request({ type, mfcItemIds: [98_777, 1] }))?.request).toEqual({
        type,
        mfcItemIds: [itemId(98_777), itemId(1)],
      });
    }
  });

  test("acknowledges more picks than one fetch may ask for", () => {
    const mfcItemIds = Array.from({ length: MAX_ITEMS_PER_REQUEST + 1 }, (_, index) => index + 1);
    for (const type of ["picks-saved", "picks-discarded"] as const) {
      expect(decodeBridgeRequest(request({ type, mfcItemIds }))?.request).toEqual({
        type,
        mfcItemIds: mfcItemIds.map(itemId),
      });
    }
  });

  test.each([
    ["take-picks with a field", { type: "take-picks", mfcItemIds: [1] }],
    ["picks-saved without ids", { type: "picks-saved", mfcItemIds: [] }],
    ["picks-saved with duplicate ids", { type: "picks-saved", mfcItemIds: [1, 1] }],
    ["picks-discarded with a string id", { type: "picks-discarded", mfcItemIds: ["98777"] }],
    ["picks-saved with a page", { type: "picks-saved", mfcItemIds: [1], html: "<html></html>" }],
  ])("rejects %s", (_, body) => {
    expect(decodeBridgeRequest(request(body))).toBeNull();
  });

  test("ignores the extension's own events posted on the same window", () => {
    expect(decodeBridgeRequest(event({ type: "done", reason: "complete" }))).toBeNull();
  });
});

describe("decodeBridgeEvent is lenient", () => {
  test("reads an item and leaves its result to the page codec", () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff]).buffer;
    const message: BridgeEventMessage = {
      channel: BRIDGE_CHANNEL,
      requestId: REQUEST_ID,
      event: {
        type: "item",
        mfcItemId: itemId(98_777),
        result: {
          status: "ok",
          value: { html: "<html></html>", picture: { bytes, contentType: "image/jpeg" } },
        },
      },
    };
    expect(decodeBridgeEvent(message)).toEqual(message);
  });

  test("an unknown state or reason reads as unknown", () => {
    expect(
      decodeBridgeEvent(event({ type: "status", state: "new_state", mfcItemId: null, untilMs: 1 }))
        ?.event,
    ).toEqual({ type: "status", state: "unknown", mfcItemId: null, untilMs: 1 });
    expect(decodeBridgeEvent(event({ type: "done", reason: "new_reason" }))?.event).toEqual({
      type: "done",
      reason: "unknown",
    });
  });

  test("reads picks with their picture bytes", () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff]).buffer;
    const message: BridgeEventMessage = {
      channel: BRIDGE_CHANNEL,
      requestId: REQUEST_ID,
      event: {
        type: "picks",
        picks: [
          {
            mfcItemId: itemId(98_777),
            title: "Rem",
            pickedAt: 1_798_000_000_000,
            html: "<html></html>",
            picture: { bytes, contentType: "image/jpeg" },
          },
          { mfcItemId: itemId(1), title: null, pickedAt: 1, html: "<html></html>", picture: null },
        ],
      },
    };

    const read = decodeBridgeEvent(message);

    expect(read).toEqual(message);
    expect(read?.event.type === "picks" && read.event.picks[0]?.picture?.bytes).toBe(bytes);
  });

  test("reads a newer extension's picks, whose titles may be longer and carry more fields", () => {
    const pick = {
      mfcItemId: 98_777,
      title: "R".repeat(MAX_PICK_TITLE + 1),
      pickedAt: 1.5,
      html: "<html></html>",
      picture: null,
      source: "item-page",
    };

    const read = decodeBridgeEvent(event({ type: "picks", picks: [pick] }));

    expect(read?.event.type === "picks" && read.event.picks[0]?.title).toBe(pick.title);
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

describe("an item result between the content script and the page", () => {
  test("crosses with its picture bytes, which stay the same buffer to transfer", () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff]).buffer;
    const page = { html: "<html></html>", picture: { bytes, contentType: "image/jpeg" } };

    const wire = pageItemCodec.serializeUnsafe(Result.ok(page));
    const read = pageItemCodec.deserialize(structuredClone(wire, { transfer: [bytes] }));

    expect(wire).toEqual({ status: "ok", value: page });
    expect(wire.status === "ok" && wire.value.picture?.bytes).toBe(bytes);
    expect(read.isOk() && new Uint8Array(read.value.picture?.bytes ?? new ArrayBuffer(0))).toEqual(
      new Uint8Array([0xff, 0xd8, 0xff]),
    );
  });

  test.each([...ITEM_FETCH_ERROR_CODES])("the error code %p crosses as itself", (code) => {
    const wire = pageItemCodec.serializeUnsafe(Result.err({ code }));

    expect(wire).toEqual({ status: "error", error: { code } });
    expect(pageItemCodec.deserialize(wire)).toEqual(Result.err({ code }));
  });

  test("an error code from a newer extension reads as unknown", () => {
    expect(pageItemCodec.deserialize({ status: "error", error: { code: "new_code" } })).toEqual(
      Result.err({ code: "unknown" }),
    );
  });

  test("a result the page cannot read is a deserialization error", () => {
    for (const wire of [
      { ok: false, error: "timeout" },
      { status: "ok", value: { html: "<html></html>" } },
      { status: "error", error: "timeout" },
      undefined,
    ]) {
      const read = pageItemCodec.deserialize(wire);
      expect(read.isErr() && ResultDeserializationError.is(read.error)).toBe(true);
    }
  });

  test("a failure with more than its code does not cross", () => {
    const written = pageItemCodec.serialize(
      Result.err({ code: "timeout", message: "MFC took 45 s", stack: "at fetch" }),
    );

    expect(written.isErr() && ResultSerializationError.is(written.error)).toBe(true);
  });
});

describe("an item result between the background and the content script", () => {
  test("crosses JSON with its picture as base64 and arrives as bytes", () => {
    const page = { html: "<html></html>", picture: { base64: "/9j/2Q==", contentType: "" } };

    const json = JSON.stringify(portItemCodec.serializeUnsafe(Result.ok(page)));
    const wire = parseJson(z.unknown(), json).unwrap();
    const read = portItemCodec.deserializeUnsafe(wire);

    expect(wire).toEqual({ status: "ok", value: page });
    expect(read.isOk() && read.value.html).toBe("<html></html>");
    expect(read.isOk() && new Uint8Array(read.value.picture?.bytes ?? new ArrayBuffer(0))).toEqual(
      new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
    );
  });

  test.each([...ITEM_FETCH_ERROR_CODES])("the error code %p crosses as itself", (code) => {
    const wire = portItemCodec.serializeUnsafe(Result.err({ code }));

    expect(wire).toEqual({ status: "error", error: { code } });
    expect(portItemCodec.deserializeUnsafe(wire)).toEqual(Result.err({ code }));
  });

  test("a result one end of the build cannot read is a defect", () => {
    expect(() =>
      portItemCodec.deserializeUnsafe({ status: "error", error: { code: "new" } }),
    ).toThrow(Panic);
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

  test("pick requests carry their request id and only ids", () => {
    expect(portRequestSchema.safeParse({ type: "take-picks", requestId: REQUEST_ID }).success).toBe(
      true,
    );
    for (const type of ["picks-saved", "picks-discarded"]) {
      expect(
        portRequestSchema.safeParse({ type, requestId: REQUEST_ID, mfcItemIds: [1] }).success,
      ).toBe(true);
      expect(portRequestSchema.safeParse({ type, mfcItemIds: [1] }).success).toBe(false);
      expect(
        portRequestSchema.safeParse({ type, requestId: REQUEST_ID, mfcItemIds: [1], url: "x" })
          .success,
      ).toBe(false);
    }
    expect(portRequestSchema.safeParse({ type: "take-picks" }).success).toBe(false);
  });

  test("a pick acknowledgement has no fetch count limit", () => {
    const mfcItemIds = Array.from({ length: MAX_ITEMS_PER_REQUEST + 1 }, (_, index) => index + 1);
    for (const type of ["picks-saved", "picks-discarded"] as const) {
      expect(portRequestSchema.safeParse({ type, requestId: REQUEST_ID, mfcItemIds }).data).toEqual(
        { type, requestId: REQUEST_ID, mfcItemIds: mfcItemIds.map(itemId) },
      );
    }
  });

  test("a picks event is strict and carries each picture as base64", () => {
    const pick = {
      mfcItemId: itemId(98_777),
      title: "R".repeat(MAX_PICK_TITLE),
      pickedAt: 1_798_000_000_000,
      html: "<html></html>",
      picture: { base64: "/9j/", contentType: "image/jpeg" },
    };
    const picks = (overrides: WireMessage) => ({
      requestId: REQUEST_ID,
      event: { type: "picks" as const, picks: [{ ...pick, ...overrides }] },
    });

    expect(portEventSchema.parse(picks({}))).toEqual(picks({}));
    expect(
      portEventSchema.safeParse(picks({ title: "R".repeat(MAX_PICK_TITLE + 1) })).success,
    ).toBe(false);
    expect(portEventSchema.safeParse(picks({ pickedAt: 1.5 })).success).toBe(false);
    expect(
      portEventSchema.safeParse(picks({ picture: { base64: "%", contentType: "" } })).success,
    ).toBe(false);
    expect(portEventSchema.safeParse(picks({ source: "item-page" })).success).toBe(false);
  });

  test("an event carries the picture as base64", () => {
    const portEvent: PortEvent = {
      requestId: REQUEST_ID,
      event: {
        type: "item",
        mfcItemId: itemId(98_777),
        result: {
          status: "ok",
          value: { html: "<html></html>", picture: { base64: "/9j/", contentType: "" } },
        },
      },
    };
    expect(portEventSchema.parse(portEvent)).toEqual(portEvent);
    expect(
      portEventSchema.safeParse({
        ...portEvent,
        event: {
          ...portEvent.event,
          result: { status: "ok", value: { html: "", picture: { base64: "%" } } },
        },
      }).success,
    ).toBe(false);
  });

  test("the event schema and the event type agree", () => {
    type Agree<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
    expectTypeOf<Agree<z.output<typeof portEventSchema>, PortEvent>>().toEqualTypeOf<true>();
  });
});
