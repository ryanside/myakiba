import { describe, expect, test } from "bun:test";
import { Result } from "better-result";
import type { PortEvent, PortRequest } from "@myakiba/mfc/bridge";
import { ORIGINS, itemId } from "../test/fake-browser";
import type { FetchRun } from "./fetcher";
import { servePort } from "./port-host";
import type { PortSender } from "./port-host";
import type { RunKey } from "./queue";

const EXTENSION_ID = "ours";
const REQUEST_ID = "6f1c1f43-1e5b-4c39-9df5-5b0c2a3e8b11";
const OWN_CONTENT_SCRIPT: PortSender = {
  id: EXTENSION_ID,
  frameId: 0,
  origin: ORIGINS.web,
  url: `${ORIGINS.web}/sync`,
  tab: { id: 7, incognito: false },
};

type PortMessage = { readonly [key: string]: string | number | readonly number[] };

function connect(sender: PortSender) {
  const posted: PortEvent[] = [];
  const submitted: FetchRun[] = [];
  const cancelled: RunKey[] = [];
  let onMessage: (message: PortRequest) => void = () => {};
  let onDisconnect = () => {};
  let disconnected = false;
  servePort(
    {
      sender,
      postMessage: (message) => posted.push(message),
      disconnect: () => {
        disconnected = true;
      },
      onMessage: {
        addListener: (listener) => {
          onMessage = listener;
        },
      },
      onDisconnect: {
        addListener: (listener) => {
          onDisconnect = listener;
        },
      },
    },
    {
      submit: (run) => submitted.push(run),
      cancel: (key) => cancelled.push(key),
    },
    { extensionId: EXTENSION_ID, webOrigin: ORIGINS.web },
  );
  return {
    posted,
    submitted,
    cancelled,
    send: (message: PortMessage) => onMessage(message as PortRequest),
    close: () => onDisconnect(),
    disconnected: () => disconnected,
  };
}

describe("servePort", () => {
  test.each([
    ["a foreign origin", { origin: "https://evil.example", url: "https://evil.example/" }],
    ["a child frame", { frameId: 1 }],
    ["another extension", { id: "theirs" }],
    ["no tab", { tab: undefined }],
    ["a tab of unknown browsing context", { tab: { id: 7 } }],
  ])("refuses %s", (_, change) => {
    const port = connect({ ...OWN_CONTENT_SCRIPT, ...change });
    port.send({ type: "fetch-items", requestId: REQUEST_ID, mfcItemIds: [1] });

    expect(port.disconnected()).toBe(true);
    expect(port.submitted).toEqual([]);
  });

  test("accepts Firefox's sender, which has a URL but no origin", () => {
    const port = connect({ ...OWN_CONTENT_SCRIPT, origin: undefined });
    port.send({ type: "fetch-items", requestId: REQUEST_ID, mfcItemIds: [1] });

    expect(port.submitted).toHaveLength(1);
  });

  test("runs a fetch for the sender's tab and streams its events back", () => {
    const port = connect(OWN_CONTENT_SCRIPT);
    port.send({ type: "fetch-items", requestId: REQUEST_ID, mfcItemIds: [1, 2] });
    const [run] = port.submitted;
    run?.emit({ type: "done", reason: "complete" });

    expect(run?.requester).toEqual({
      tabId: 7,
      context: { incognito: false, cookieStoreId: null },
    });
    expect(run?.mfcItemIds).toEqual([itemId(1), itemId(2)]);
    expect(port.posted).toEqual([
      { requestId: REQUEST_ID, event: { type: "done", reason: "complete" } },
    ]);
  });

  test("posts each kind of event to the port as the wire carries it", () => {
    const port = connect(OWN_CONTENT_SCRIPT);
    port.send({ type: "fetch-items", requestId: REQUEST_ID, mfcItemIds: [1, 2] });
    const [run] = port.submitted;
    const picture = { base64: "/9j/", contentType: "image/jpeg" };
    run?.emit({ type: "status", state: "fetching", mfcItemId: itemId(1), untilMs: null });
    run?.emit({
      type: "item",
      mfcItemId: itemId(1),
      result: Result.ok({ html: "<html>1</html>", picture }),
    });
    run?.emit({ type: "item", mfcItemId: itemId(2), result: Result.err({ code: "timeout" }) });
    run?.emit({ type: "done", reason: "complete" });

    expect(port.posted).toEqual([
      {
        requestId: REQUEST_ID,
        event: { type: "status", state: "fetching", mfcItemId: itemId(1), untilMs: null },
      },
      {
        requestId: REQUEST_ID,
        event: {
          type: "item",
          mfcItemId: itemId(1),
          result: { status: "ok", value: { html: "<html>1</html>", picture } },
        },
      },
      {
        requestId: REQUEST_ID,
        event: {
          type: "item",
          mfcItemId: itemId(2),
          result: { status: "error", error: { code: "timeout" } },
        },
      },
      { requestId: REQUEST_ID, event: { type: "done", reason: "complete" } },
    ]);
  });

  test("runs a fetch in the sender's container", () => {
    const port = connect({
      ...OWN_CONTENT_SCRIPT,
      tab: { id: 7, incognito: true, cookieStoreId: "firefox-private" },
    });
    port.send({ type: "fetch-items", requestId: REQUEST_ID, mfcItemIds: [1] });

    expect(port.submitted[0]?.requester.context).toEqual({
      incognito: true,
      cookieStoreId: "firefox-private",
    });
  });

  test("ignores a URL", () => {
    const port = connect(OWN_CONTENT_SCRIPT);
    port.send({ type: "fetch-url", url: `${ORIGINS.mfc}/item/1` });
    port.send({ type: "fetch-items", requestId: REQUEST_ID, mfcItemIds: [1], url: ORIGINS.mfc });

    expect(port.disconnected()).toBe(false);
    expect(port.submitted).toEqual([]);
  });

  test("a cancel or a closed port cancels the port's runs", () => {
    const port = connect(OWN_CONTENT_SCRIPT);
    port.send({ type: "fetch-items", requestId: REQUEST_ID, mfcItemIds: [1] });
    port.send({ type: "cancel", targetRequestId: REQUEST_ID });
    port.close();

    const key = port.submitted[0]?.key;
    expect<readonly (RunKey | undefined)[]>(port.cancelled).toEqual([key, key]);
  });
});
