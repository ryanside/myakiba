import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import type { Mock } from "bun:test";
import { ORIGINS, itemId } from "../../test/fake-browser";
import {
  ITEM_98777,
  PUBLIC_ITEM,
  edit,
  fakeBackground,
  pageAt,
  settled,
} from "../../test/mfc-page";
import type { MfcTestPage } from "../../test/mfc-page";
import type { MfcPageState } from "../pick-host";
import type { PageFetch } from "./capture";
import { startMfcPicking } from "./start";
import type { MfcPickingDeps } from "./start";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const SFW_IMAGE = "https://static.myfigurecollection.net/ressources/icons/nsfw.png";

const consoleWarn = spyOn(console, "warn").mockImplementation(() => {});
const consoleError = spyOn(console, "error").mockImplementation(() => {});
let globalFetch: Mock<typeof fetch>;

beforeEach(() => {
  globalFetch = spyOn(globalThis, "fetch");
});

afterEach(() => {
  globalFetch.mockRestore();
  consoleWarn.mockClear();
  consoleError.mockClear();
});

function pictureFetch(bytes: Uint8Array<ArrayBuffer> = JPEG) {
  return mock<PageFetch>(
    async () => new Response(bytes, { headers: { "content-type": "image/jpeg" } }),
  );
}

type Started = {
  readonly page: MfcTestPage;
  readonly background: ReturnType<typeof fakeBackground>;
  readonly fetch: Mock<PageFetch>;
  readonly xhr: Mock<() => void>;
};

async function start(
  options: {
    html?: string;
    pathname?: string;
    fetch?: Mock<PageFetch>;
    localQuota?: number;
    runtime?: MfcPickingDeps["runtime"];
  } = {},
): Promise<Started> {
  const page = pageAt(options.html ?? ITEM_98777, options.pathname);
  const background = fakeBackground({
    localQuota: options.localQuota,
    pathname: options.pathname,
  });
  const fetch = options.fetch ?? pictureFetch();
  const xhr = mock(() => {});
  Object.assign(page.window, { XMLHttpRequest: xhr, fetch: globalFetch });
  startMfcPicking({
    window: page.window,
    runtime: options.runtime ?? background.runtime,
    fetch,
    origins: ORIGINS,
  });
  await settled(page);
  return { page, background, fetch, xhr };
}

async function click({ page }: Started) {
  page.toggle().click();
  await settled(page);
}

const noteText = ({ page }: Started) => page.root("note").textContent;
const refusal = ({ page }: Started) => page.root("toggle").querySelector('[role="alert"]');

function setVisibility(page: MfcTestPage, state: "visible" | "hidden") {
  Object.defineProperty(page.document, "visibilityState", { value: state, configurable: true });
  page.document.dispatchEvent(new page.window.Event("visibilitychange"));
}

describe("a page load", () => {
  test.each([
    ["a gated Item", ITEM_98777],
    ["a public Item", PUBLIC_ITEM],
  ])("on %s sends one field-less mfc-hello and makes no request", async (_, html) => {
    const started = await start({ html });

    expect(started.background.sent).toEqual([{ type: "mfc-hello" }]);
    expect(started.fetch).not.toHaveBeenCalled();
    expect(globalFetch).not.toHaveBeenCalled();
    expect(started.xhr).not.toHaveBeenCalled();
  });

  test("on a page that is no Item mounts nothing and sends nothing", async () => {
    const started = await start({ pathname: "/item/random/" });

    expect(started.page.document.querySelector("[data-myakiba-pick]")).toBeNull();
    expect(started.background.sent).toEqual([]);
    expect(started.fetch).not.toHaveBeenCalled();
  });

  test("on a page whose canonical link disagrees mounts nothing and sends nothing", async () => {
    const started = await start({ pathname: "/item/98778" });

    expect(started.page.document.querySelector("[data-myakiba-pick]")).toBeNull();
    expect(started.background.sent).toEqual([]);
  });

  test("shows an unpressed toggle last in MFC's bar, and no note", async () => {
    const started = await start();
    const button = started.page.toggle();

    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(button.getAttribute("aria-label")).toBe("Pick for myakiba");
    expect(
      started.page.document.querySelector(".content-meta .content-actions.desktop")
        ?.lastElementChild,
    ).toBe(started.page.document.querySelector('[data-myakiba-pick="toggle"]'));
    expect(noteText(started)).toBe("");
  });

  test("styles a closed root with an adopted sheet", async () => {
    const started = await start();
    const root = started.page.root("toggle");

    expect(root.mode).toBe("closed");
    expect(root.adoptedStyleSheets).toHaveLength(1);
    expect(root.querySelector("style")).toBeNull();
  });

  test("falls back to a style element where adopting a sheet throws, as Firefox's wrappers can", async () => {
    const page = pageAt(ITEM_98777);
    const prototype = page.window.ShadowRoot.prototype;
    const adopted = Object.getOwnPropertyDescriptor(prototype, "adoptedStyleSheets");
    if (!adopted) throw new Error("this DOM has no adoptedStyleSheets");
    Object.defineProperty(prototype, "adoptedStyleSheets", {
      get: () => [],
      set() {
        throw new Error("Accessing from Xray wrapper is not supported.");
      },
    });
    try {
      startMfcPicking({
        window: page.window,
        runtime: fakeBackground().runtime,
        fetch: pictureFetch(),
        origins: ORIGINS,
      });
      await settled(page);
    } finally {
      Object.defineProperty(prototype, "adoptedStyleSheets", adopted);
    }

    expect(page.root("toggle").querySelector("style")?.textContent).toContain("button.toggle");
  });

  test("shows what this context already picked", async () => {
    const background = fakeBackground();
    const page = pageAt(ITEM_98777);
    const stored = await background.picks.add(
      { incognito: false, cookieStoreId: null },
      { mfcItemId: itemId(98_777), title: "Kept", html: "<html></html>", picture: null },
    );
    expect(stored.isOk()).toBe(true);

    startMfcPicking({
      window: page.window,
      runtime: background.runtime,
      fetch: pictureFetch(),
      origins: ORIGINS,
    });
    await settled(page);

    expect(page.toggle().getAttribute("aria-pressed")).toBe("true");
    expect(page.root("note").textContent).toBe("1 picked · Review in myakiba");
  });
});

describe("coming back to the tab", () => {
  test("asks again with a field-less hello only when the page turns visible", async () => {
    const started = await start();

    setVisibility(started.page, "hidden");
    await settled(started.page);
    expect(started.background.sent).toHaveLength(1);

    setVisibility(started.page, "visible");
    await settled(started.page);
    expect(started.background.sent).toEqual([{ type: "mfc-hello" }, { type: "mfc-hello" }]);
    expect(started.fetch).not.toHaveBeenCalled();
  });

  test("picks up what happened elsewhere, such as the Add page collecting the picks", async () => {
    const started = await start();
    await click(started);
    expect(noteText(started)).toBe("1 picked · Review in myakiba");

    const removed = await started.background.picks.remove(
      { incognito: false, cookieStoreId: null },
      [itemId(98_777)],
    );
    expect(removed.isOk()).toBe(true);
    setVisibility(started.page, "visible");
    await settled(started.page);

    expect(started.page.toggle().getAttribute("aria-pressed")).toBe("false");
    expect(noteText(started)).toBe("");
  });

  test("does not paint a hello's older answer over a click", async () => {
    const answers: ((state: MfcPageState) => void)[] = [];
    const started = await start({
      runtime: {
        sendMessage: () =>
          new Promise((resolve) => {
            answers.push(resolve);
          }),
      },
    });
    const state = { count: 1, full: false, refused: null };

    await click(started);
    answers[1]?.({ ...state, picked: true });
    await settled(started.page);
    answers[0]?.({ ...state, picked: false });
    await settled(started.page);

    expect(started.page.toggle().getAttribute("aria-pressed")).toBe("true");
  });
});

describe("a click on Pick", () => {
  test("makes one request, sends one mfc-pick with the capture, and shows it picked", async () => {
    const started = await start();

    await click(started);

    expect(started.fetch).toHaveBeenCalledTimes(1);
    expect(globalFetch).not.toHaveBeenCalled();
    const [hello, pick, ...rest] = started.background.sent;
    expect(hello).toEqual({ type: "mfc-hello" });
    expect(rest).toEqual([]);
    if (pick?.type !== "mfc-pick") throw new Error("the click sent no mfc-pick");
    expect(pick.capture.mfcItemId).toBe(itemId(98_777));
    expect(pick.capture.picture?.contentType).toBe("image/jpeg");
    expect(pick.capture.html).not.toContain("fixture_user");
    const button = started.page.toggle();
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.getAttribute("aria-label")).toBe("Picked for myakiba");
  });

  test("shows the note, with a plain link to the Add page in a named tab", async () => {
    const started = await start();

    await click(started);

    expect(noteText(started)).toBe("1 picked · Review in myakiba");
    const link = started.page.root("note").querySelector("a");
    expect(link?.getAttribute("href")).toBe(`${ORIGINS.web}/add?from=mfc`);
    expect(link?.getAttribute("target")).toBe("myakiba-add");
    expect(started.page.root("note").querySelector('[role="status"]')).not.toBeNull();
  });

  test("still picks when the picture fetch fails", async () => {
    const fetch = mock<PageFetch>(() => Promise.reject(new TypeError("Failed to fetch")));
    const started = await start({ fetch });

    await click(started);

    const pick = started.background.sent[1];
    if (pick?.type !== "mfc-pick") throw new Error("the click sent no mfc-pick");
    expect(pick.capture.picture).toBeNull();
    expect(started.page.toggle().getAttribute("aria-pressed")).toBe("true");
  });

  test("a second click unpicks with mfc-unpick and no request, and the note goes", async () => {
    const started = await start();
    await click(started);

    await click(started);

    expect(started.background.sent.at(-1)).toEqual({
      type: "mfc-unpick",
      mfcItemId: itemId(98_777),
    });
    expect(started.fetch).toHaveBeenCalledTimes(1);
    expect(started.page.toggle().getAttribute("aria-pressed")).toBe("false");
    expect(noteText(started)).toBe("");
  });

  test("double-clicking while it works picks once", async () => {
    const started = await start();

    started.page.toggle().click();
    started.page.toggle().click();
    await settled(started.page);

    expect(started.background.sent.filter((message) => message.type === "mfc-pick")).toHaveLength(
      1,
    );
    expect(started.page.toggle().getAttribute("aria-pressed")).toBe("true");
  });

  test("is a real button that stays focused and enabled while it works, so the keyboard keeps its place", async () => {
    const started = await start({
      fetch: mock<PageFetch>(() => new Promise(() => {})),
    });
    const button = started.page.toggle();

    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("type")).toBe("button");
    expect(button.hasAttribute("tabindex")).toBe(false);
    button.focus();
    button.click();
    await settled(started.page);

    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.disabled).toBe(false);
    expect(started.page.root("toggle").activeElement).toBe(button);
  });
});

describe("a pick that is refused", () => {
  test("on MFC's SFW placeholder names the switch's menu, links nowhere, and sends nothing", async () => {
    const og = /<meta property="og:image" content="([^"]+)"/.exec(ITEM_98777)?.[1] ?? "";
    const started = await start({ html: edit(ITEM_98777, og, SFW_IMAGE) });

    await click(started);

    expect(started.background.sent).toEqual([{ type: "mfc-hello" }]);
    expect(started.fetch).not.toHaveBeenCalled();
    expect(refusal(started)?.textContent).toContain(
      "Turn SFW off in the menu under your profile picture",
    );
    expect(refusal(started)?.querySelector("a")).toBeNull();
    expect(started.page.toggle().getAttribute("aria-pressed")).toBe("false");
  });

  test("on a canonical link that changed after load sends nothing and says so", async () => {
    const started = await start();
    started.page.document
      .querySelector('link[rel="canonical"]')
      ?.setAttribute("href", "https://myfigurecollection.net/item/98778");

    await click(started);

    expect(started.background.sent).toEqual([{ type: "mfc-hello" }]);
    expect(refusal(started)?.textContent).toContain("different item");
  });

  test("by a full store says so and links to the Add page", async () => {
    const tooLarge = new Uint8Array(9 * 1024 * 1024);
    tooLarge.set(JPEG);
    const started = await start({ fetch: pictureFetch(tooLarge) });

    await click(started);

    expect(refusal(started)?.textContent).toContain("Your picks are full.Review them in myakiba.");
    expect(refusal(started)?.querySelector("a")?.getAttribute("href")).toBe(
      `${ORIGINS.web}/add?from=mfc`,
    );
    expect(started.page.toggle().getAttribute("aria-pressed")).toBe("false");
  });

  test("by storage says the browser could not save it", async () => {
    const started = await start({ localQuota: 1 });

    await click(started);

    expect(refusal(started)?.textContent).toContain("could not save");
    expect(started.page.toggle().getAttribute("aria-pressed")).toBe("false");
  });

  test("with no answer from the background asks for a reload", async () => {
    const started = await start({
      runtime: { sendMessage: () => Promise.reject(new Error("Extension context invalidated.")) },
    });

    await click(started);

    expect(refusal(started)?.textContent).toContain("Reload this page");
    expect(started.page.toggle().getAttribute("aria-busy")).toBeNull();
  });

  test("shows no refusal after a dismiss, or after the next try works", async () => {
    const started = await start();
    started.background.local.refuse("set");
    await click(started);

    refusal(started)?.querySelector("button")?.click();
    await settled(started.page);
    expect(refusal(started)).toBeNull();

    started.background.local.refuse("set");
    await click(started);
    expect(refusal(started)).not.toBeNull();

    await click(started);
    expect(refusal(started)).toBeNull();
    expect(started.page.toggle().getAttribute("aria-pressed")).toBe("true");
  });

  test("Dismiss returns focus to the Pick button, so the keyboard keeps its place", async () => {
    const started = await start({ localQuota: 1 });
    await click(started);
    const dismiss = refusal(started)?.querySelector("button");
    dismiss?.focus();

    dismiss?.click();
    await settled(started.page);

    expect(started.page.root("toggle").activeElement).toBe(started.page.toggle());
  });

  test("on an unpick the browser could not save keeps it picked and says so", async () => {
    const started = await start();
    await click(started);
    started.background.local.refuse("set");

    await click(started);

    expect(started.page.toggle().getAttribute("aria-pressed")).toBe("true");
    expect(refusal(started)?.textContent).toContain("could not save");
  });

  test("announces each refusal through an alert inserted when it happens", async () => {
    const started = await start({ localQuota: 1 });
    expect(refusal(started)).toBeNull();

    await click(started);

    expect(refusal(started)?.getAttribute("role")).toBe("alert");
  });
});

describe("the note", () => {
  test("is a status region that is there before it has anything to say", async () => {
    const started = await start();

    const region = started.page.root("note").querySelector('[role="status"]');
    expect(region).not.toBeNull();
    expect(region?.childElementCount).toBe(0);
  });

  test("says the store is full once it is, and still links to the Add page", async () => {
    const started = await start({
      runtime: {
        sendMessage: () => Promise.resolve({ picked: true, count: 3, full: true, refused: null }),
      },
    });

    expect(noteText(started)).toBe("Your picks are full. Review them in myakiba.");
    expect(started.page.root("note").querySelector("a")?.getAttribute("target")).toBe(
      "myakiba-add",
    );
  });
});
