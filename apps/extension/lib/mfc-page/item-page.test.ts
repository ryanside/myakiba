import { describe, expect, test } from "bun:test";
import { MAX_PICK_TITLE } from "@myakiba/contracts/add/constants";
import { itemId } from "../../test/fake-browser";
import { ITEM_98777, edit, pageAt, settled } from "../../test/mfc-page";
import { itemOnPage, keepToggleInPlace, placeToggle } from "./item-page";

const ACTION_BAR = ".content-meta .content-actions.desktop:not(nav)";
const hostIn = (doc: Document) => {
  const host = doc.createElement("div");
  host.dataset["myakibaPick"] = "toggle";
  return host;
};

describe("itemOnPage", () => {
  test("reads the Item from its address, its canonical link and its heading", () => {
    const { document } = pageAt(ITEM_98777);

    expect(itemOnPage(document, { pathname: "/item/98777" })).toEqual({
      mfcItemId: itemId(98_777),
      title: "[Explicit] - Hello, Good-bye - Yukishiro May - 1/7 (Orchid Seed)",
    });
  });

  test("is no Item when the address is not an Item's", () => {
    const { document } = pageAt(ITEM_98777);

    for (const pathname of ["/item/", "/item/random/", "/item/98777/edit", "/item/0"]) {
      expect(itemOnPage(document, { pathname })).toBeNull();
    }
  });

  test("is no Item when the canonical link names another Item, or none", () => {
    const { document } = pageAt(ITEM_98777);

    expect(itemOnPage(document, { pathname: "/item/98778" })).toBeNull();
    document.querySelector('link[rel="canonical"]')?.remove();
    expect(itemOnPage(document, { pathname: "/item/98777" })).toBeNull();
  });

  test("keeps a title the message contract accepts", () => {
    const long = "x".repeat(MAX_PICK_TITLE + 50);
    const { document } = pageAt(
      edit(
        ITEM_98777,
        "[Explicit] - Hello, Good-bye - Yukishiro May - 1/7 (Orchid Seed)</h1>",
        `${long}</h1>`,
      ),
    );

    expect(itemOnPage(document, { pathname: "/item/98777" })?.title).toHaveLength(MAX_PICK_TITLE);
  });

  test("has no title without a heading, and still is the Item", () => {
    const { document } = pageAt(ITEM_98777);
    document.querySelector("h1.title")?.remove();

    expect(itemOnPage(document, { pathname: "/item/98777" })).toEqual({
      mfcItemId: itemId(98_777),
      title: null,
    });
  });
});

describe("placeToggle", () => {
  test("goes last in MFC's action bar, not in the Prev and Next nav", () => {
    const { document } = pageAt(ITEM_98777);
    const host = hostIn(document);

    placeToggle(document, host);

    const bar = document.querySelector<HTMLElement>(ACTION_BAR);
    expect(host.parentElement).toBe(bar);
    expect(bar?.lastElementChild).toBe(host);
    expect(host.dataset["floating"]).toBeUndefined();
  });

  test("floats over the page when the page has no action bar", () => {
    const { document } = pageAt(ITEM_98777);
    document.querySelector(ACTION_BAR)?.remove();
    const host = hostIn(document);

    placeToggle(document, host);

    expect(host.parentElement).toBe(document.body);
    expect(host.dataset["floating"]).toBe("");
  });

  test("floats when MFC hides the action bar", () => {
    const { document } = pageAt(ITEM_98777);
    document.querySelector<HTMLElement>(ACTION_BAR)?.style.setProperty("display", "none");
    const host = hostIn(document);

    placeToggle(document, host);

    expect(host.parentElement).toBe(document.body);
    expect(host.dataset["floating"]).toBe("");
  });

  test("moves nothing when it is already in place", () => {
    const { document } = pageAt(ITEM_98777);
    const host = hostIn(document);
    placeToggle(document, host);
    let moved = 0;
    const append = host.parentElement?.append.bind(host.parentElement);
    if (host.parentElement) {
      host.parentElement.append = (...nodes) => {
        moved += 1;
        append?.(...nodes);
      };
    }

    placeToggle(document, host);

    expect(moved).toBe(0);
  });
});

describe("keepToggleInPlace", () => {
  test("remounts in the bar when MFC rewrites the header's contents", async () => {
    const page = pageAt(ITEM_98777);
    const host = hostIn(page.document);
    keepToggleInPlace(page.window, host);
    const bar = page.document.querySelector(ACTION_BAR);

    bar?.replaceChildren(page.document.createElement("a"));
    await settled(page);

    expect(bar?.lastElementChild).toBe(host);
  });

  test("goes back last when MFC appends after it", async () => {
    const page = pageAt(ITEM_98777);
    const host = hostIn(page.document);
    keepToggleInPlace(page.window, host);
    const bar = page.document.querySelector(ACTION_BAR);

    bar?.append(page.document.createElement("a"));
    await settled(page);

    expect(bar?.lastElementChild).toBe(host);
  });

  test("follows the bar in and out of view when the window resizes", () => {
    const page = pageAt(ITEM_98777);
    const host = hostIn(page.document);
    keepToggleInPlace(page.window, host);
    const bar = page.document.querySelector<HTMLElement>(ACTION_BAR);

    bar?.style.setProperty("display", "none");
    page.window.dispatchEvent(new page.window.Event("resize"));
    expect(host.parentElement).toBe(page.document.body);

    bar?.style.removeProperty("display");
    page.window.dispatchEvent(new page.window.Event("resize"));
    expect(host.parentElement).toBe(bar);
  });
});
