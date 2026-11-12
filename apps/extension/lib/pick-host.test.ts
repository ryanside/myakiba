import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { ORIGINS, fakeStorageArea, ok } from "../test/fake-browser";
import { pickListener } from "./pick-host";
import type { MfcPageRequest, MfcPageState } from "./pick-host";
import { createPicks } from "./picks";
import type { PortSender } from "./port-host";

const EXTENSION_ID = "ours";
const ITEM_PAGE: PortSender = {
  id: EXTENSION_ID,
  frameId: 0,
  origin: ORIGINS.mfc,
  url: `${ORIGINS.mfc}/item/98777`,
  tab: { id: 4, incognito: false },
};

const consoleWarn = spyOn(console, "warn").mockImplementation(() => {});

afterEach(() => {
  consoleWarn.mockClear();
});

function capture(id: number, html = `<html>${id}</html>`) {
  return { mfcItemId: id, title: `Item ${id}`, html, picture: null };
}

type PageMessage = { readonly [key: string]: string | number | ReturnType<typeof capture> };

function host(options: { localQuota?: number } = {}) {
  const local = fakeStorageArea(options.localQuota);
  const session = fakeStorageArea();
  const picks = createPicks({ local: local.area, session: session.area, clock: { now: () => 1 } });
  const listener = pickListener(picks, { extensionId: EXTENSION_ID, mfcOrigin: ORIGINS.mfc });

  /** Sends a message as the content script does, and settles with the answer, or null when the listener drops it. */
  async function send(message: PageMessage, sender: PortSender = ITEM_PAGE) {
    const answered = Promise.withResolvers<MfcPageState>();
    const kept = listener(message as MfcPageRequest, sender, answered.resolve);
    return kept ? answered.promise : null;
  }

  return { picks, local, session, send };
}

const NOT_PICKED: MfcPageState = { picked: false, count: 0, full: false, refused: null };

describe("an MFC Item page", () => {
  test("asking hello learns its Item is not picked yet, and nothing is stored", async () => {
    const { send, local } = host();

    expect(await send({ type: "mfc-hello" })).toEqual(NOT_PICKED);
    expect(local.keys()).toEqual([]);
  });

  test("picks and unpicks its Item, and doing either twice changes nothing more", async () => {
    const { send } = host();
    const picked: MfcPageState = { picked: true, count: 1, full: false, refused: null };

    expect(await send({ type: "mfc-pick", capture: capture(98_777) })).toEqual(picked);
    expect(await send({ type: "mfc-pick", capture: capture(98_777) })).toEqual(picked);
    expect(await send({ type: "mfc-hello" })).toEqual(picked);
    expect(await send({ type: "mfc-unpick", mfcItemId: 98_777 })).toEqual(NOT_PICKED);
    expect(await send({ type: "mfc-unpick", mfcItemId: 98_777 })).toEqual(NOT_PICKED);
  });

  test("counts the picks of its own browsing context only", async () => {
    const { send } = host();
    const container = {
      ...ITEM_PAGE,
      tab: { id: 5, incognito: false, cookieStoreId: "firefox-container-1" },
    };
    const privately = { ...ITEM_PAGE, tab: { id: 6, incognito: true } };
    await send({ type: "mfc-pick", capture: capture(98_777) }, container);

    expect(await send({ type: "mfc-hello" })).toEqual(NOT_PICKED);
    expect(await send({ type: "mfc-hello" }, privately)).toEqual(NOT_PICKED);
    expect(await send({ type: "mfc-hello" }, container)).toEqual({
      picked: true,
      count: 1,
      full: false,
      refused: null,
    });
  });

  test("accepts Firefox's sender, which has a URL but no origin, and a trailing slash or query", async () => {
    const { send } = host();

    expect(
      await send(
        { type: "mfc-hello" },
        { ...ITEM_PAGE, origin: undefined, url: `${ORIGINS.mfc}/item/98777/?ref=x` },
      ),
    ).toEqual(NOT_PICKED);
  });

  test("hears why a pick was refused when the store is full, and keeps its other picks", async () => {
    const { send, picks } = host();
    const page = "a".repeat(2 * 1024 * 1024);
    for (const id of [1, 2, 3]) {
      await send(
        { type: "mfc-pick", capture: capture(id, page) },
        { ...ITEM_PAGE, url: `${ORIGINS.mfc}/item/${id}` },
      );
    }

    expect(await send({ type: "mfc-pick", capture: capture(98_777, page) })).toEqual({
      picked: false,
      count: 3,
      full: true,
      refused: "full",
    });
    expect(await ok(picks.read({ incognito: false, cookieStoreId: null }))).toHaveLength(3);
  });

  test("hears that storage failed when the browser refuses the write", async () => {
    const { send } = host({ localQuota: 100 });

    expect(await send({ type: "mfc-pick", capture: capture(98_777) })).toEqual({
      ...NOT_PICKED,
      refused: "storage_failed",
    });
  });
});

describe("a message the background drops without an answer", () => {
  test("unpicks another Item than the page shows", async () => {
    const { send, picks } = host();
    await send(
      { type: "mfc-pick", capture: capture(1) },
      { ...ITEM_PAGE, url: `${ORIGINS.mfc}/item/1` },
    );

    expect(await send({ type: "mfc-unpick", mfcItemId: 1 })).toBeNull();
    expect(await ok(picks.read({ incognito: false, cookieStoreId: null }))).toHaveLength(1);
  });

  test.each([
    ["another extension", { id: "theirs" }],
    ["a child frame", { frameId: 2 }],
    [
      "a foreign origin",
      { origin: "https://evil.example", url: "https://evil.example/item/98777" },
    ],
    ["the myakiba origin", { origin: ORIGINS.web, url: `${ORIGINS.web}/item/98777` }],
    ["MFC's front page", { url: `${ORIGINS.mfc}/` }],
    ["an Item's sub-page", { url: `${ORIGINS.mfc}/item/98777/pictures` }],
    ["an id that is not an MFC id", { url: `${ORIGINS.mfc}/item/0` }],
    ["no tab", { tab: undefined }],
    ["a tab of unknown browsing context", { tab: { id: 4 } }],
  ])("comes from %s", async (_, change) => {
    const { send, local } = host();

    expect(
      await send({ type: "mfc-pick", capture: capture(98_777) }, { ...ITEM_PAGE, ...change }),
    ).toBeNull();
    expect(local.keys()).toEqual([]);
  });

  test.each([
    ["picks another Item than the page shows", { type: "mfc-pick", capture: capture(1) }],
    ["says hello with a field", { type: "mfc-hello", url: `${ORIGINS.mfc}/item/98777` }],
    ["is a bridge request", { type: "take-picks" }],
  ])("%s", async (_, message) => {
    const { send, local } = host();

    expect(await send(message)).toBeNull();
    expect(local.keys()).toEqual([]);
  });
});
