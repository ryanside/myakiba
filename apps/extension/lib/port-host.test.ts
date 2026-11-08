import { describe, expect, spyOn, test } from "bun:test";
import { Result } from "better-result";
import type { PortEvent, PortRequest } from "@myakiba/mfc/bridge";
import { ORIGINS, fakeStorageArea, ok, itemId } from "../test/fake-browser";
import type { FetchRun } from "./fetcher";
import { createPicks } from "./picks";
import type { Picks } from "./picks";
import { servePort } from "./port-host";
import type { PortSender } from "./port-host";
import type { RunKey, TabContext } from "./queue";
import { PickStorageFailed } from "./errors/pick-storage-failed";

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

function pickStore(localQuota?: number) {
  const local = fakeStorageArea(localQuota);
  return {
    local,
    picks: createPicks({
      local: local.area,
      session: fakeStorageArea().area,
      clock: { now: () => 1 },
    }),
  };
}

async function ids(picks: Picks, context: TabContext) {
  const read = await ok(picks.read(context));
  return read.map((pick) => pick.mfcItemId);
}

function connect(sender: PortSender, picks: Picks = pickStore().picks) {
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
    picks,
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

describe("picks over the port", () => {
  const OTHER_REQUEST_ID = "0b6c1d0e-55aa-4a4e-9a51-0c2b8b1c7e02";
  const NORMAL = { incognito: false, cookieStoreId: null };
  const CONTAINER = { incognito: false, cookieStoreId: "firefox-container-1" };
  const picture = { base64: "/9j/2Q==", contentType: "image/jpeg" };
  const capture = (id: number) => ({
    mfcItemId: itemId(id),
    title: `Item ${id}`,
    html: `<html>${id}</html>`,
    picture: id === 1 ? picture : null,
  });

  async function stocked(localQuota?: number) {
    const store = pickStore(localQuota);
    for (const id of [1, 2, 3]) await ok(store.picks.add(NORMAL, capture(id)));
    await ok(store.picks.add(CONTAINER, capture(4)));
    return store;
  }

  async function answered(port: ReturnType<typeof connect>, count: number) {
    for (let turn = 0; turn < 1000 && port.posted.length < count; turn++) {
      await new Promise((resolve) => {
        setImmediate(resolve);
      });
    }
    return port.posted;
  }

  test("take-picks answers one picks event with every pick of the requester's context, and deletes none", async () => {
    const { picks } = await stocked();
    const port = connect(OWN_CONTENT_SCRIPT, picks);
    port.send({ type: "take-picks", requestId: REQUEST_ID });

    const [answer] = await answered(port, 1);
    expect(answer).toEqual({
      requestId: REQUEST_ID,
      event: {
        type: "picks",
        picks: [1, 2, 3].map((id) => ({ ...capture(id), pickedAt: 1 })),
      },
    });
    expect(await ok(picks.read(NORMAL))).toHaveLength(3);
  });

  test("a container's tab gets only that container's picks", async () => {
    const { picks } = await stocked();
    const port = connect(
      {
        ...OWN_CONTENT_SCRIPT,
        tab: { id: 7, incognito: false, cookieStoreId: CONTAINER.cookieStoreId },
      },
      picks,
    );
    port.send({ type: "take-picks", requestId: REQUEST_ID });

    const [answer] = await answered(port, 1);
    expect(
      answer?.event.type === "picks" && answer.event.picks.map((pick) => pick.mfcItemId),
    ).toEqual([itemId(4)]);
  });

  test.each(["picks-saved", "picks-discarded"])(
    "%s deletes those picks of the requester's context only, then answers done",
    async (type) => {
      const { picks } = await stocked();
      const port = connect(OWN_CONTENT_SCRIPT, picks);
      port.send({ type, requestId: REQUEST_ID, mfcItemIds: [1, 3, 4] });

      expect(await answered(port, 1)).toEqual([
        { requestId: REQUEST_ID, event: { type: "done", reason: "complete" } },
      ]);
      expect(await ids(picks, NORMAL)).toEqual([itemId(2)]);
      expect(await ids(picks, CONTAINER)).toEqual([itemId(4)]);
    },
  );

  test("picks-saved may name more picks than a fetch may name Items", async () => {
    const { picks } = await stocked();
    const port = connect(OWN_CONTENT_SCRIPT, picks);
    const many = Array.from({ length: 1500 }, (_, index) => index + 1);
    port.send({ type: "picks-saved", requestId: REQUEST_ID, mfcItemIds: many });

    expect(await answered(port, 1)).toEqual([
      { requestId: REQUEST_ID, event: { type: "done", reason: "complete" } },
    ]);
    expect(await ids(picks, NORMAL)).toEqual([]);
  });

  test("a delete storage refuses keeps the picks and answers interrupted", async () => {
    const consoleWarn = spyOn(console, "warn").mockImplementation(() => {});
    const store = await stocked();
    const refusing = {
      ...store.picks,
      remove: async () =>
        Result.err(
          new PickStorageFailed({ area: "local", op: "write", cause: new Error("quota") }),
        ),
    };
    const port = connect(OWN_CONTENT_SCRIPT, refusing);
    port.send({ type: "picks-saved", requestId: OTHER_REQUEST_ID, mfcItemIds: [1] });

    expect(await answered(port, 1)).toEqual([
      { requestId: OTHER_REQUEST_ID, event: { type: "done", reason: "interrupted" } },
    ]);
    expect(await ok(store.picks.read(NORMAL))).toHaveLength(3);
    consoleWarn.mockRestore();
  });

  test("nothing is answered once the port closed", async () => {
    const { picks } = await stocked();
    const port = connect(OWN_CONTENT_SCRIPT, picks);
    port.send({ type: "take-picks", requestId: REQUEST_ID });
    port.close();

    await answered(port, 1);
    expect(port.posted).toEqual([]);
  });

  test("a refused port deletes nothing", async () => {
    const { picks } = await stocked();
    const port = connect(
      { ...OWN_CONTENT_SCRIPT, origin: ORIGINS.mfc, url: `${ORIGINS.mfc}/item/1` },
      picks,
    );
    port.send({ type: "picks-discarded", requestId: REQUEST_ID, mfcItemIds: [1, 2, 3] });

    await answered(port, 1);
    expect(port.disconnected()).toBe(true);
    expect(await ok(picks.read(NORMAL))).toHaveLength(3);
  });
});
