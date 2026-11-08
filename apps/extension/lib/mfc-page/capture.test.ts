import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { mfcPictureUrl } from "@myakiba/contracts/add/constants";
import { ORIGINS, itemId } from "../../test/fake-browser";
import { ITEM_98777, PUBLIC_ITEM, edit, pageAt } from "../../test/mfc-page";
import { pickCaptureSchema } from "../messages";
import { capturePage } from "./capture";
import type { PageFetch } from "./capture";

const ITEM = { mfcItemId: itemId(98_777), title: "The title" };
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const SFW_IMAGE = "https://static.myfigurecollection.net/ressources/icons/nsfw.png";

const consoleWarn = spyOn(console, "warn").mockImplementation(() => {});
afterEach(() => consoleWarn.mockClear());

const jpegFetch = () =>
  mock<PageFetch>(async () => new Response(JPEG, { headers: { "content-type": "image/jpeg" } }));

function ogImageOf(html: string): string {
  const match = /<meta property="og:image" content="([^"]+)"/.exec(html)?.[1];
  if (!match) throw new Error("fixture has no og:image");
  return match;
}

function capture(html: string, fetch: PageFetch = jpegFetch()) {
  return capturePage(pageAt(html).document, ITEM, { fetch, origins: ORIGINS });
}

describe("capturePage", () => {
  test("takes the scrubbed page and exactly one picture request to MFC's commit address", async () => {
    const fetch = jpegFetch();

    const captured = await capture(ITEM_98777, fetch);

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] ?? [];
    const wanted = new URL(mfcPictureUrl(98_777));
    expect(url?.href).toBe(`${ORIGINS.mfc}/${wanted.search}`);
    expect(init?.credentials).toBe("include");
    expect(init?.cache).toBe("force-cache");
    const value = captured.unwrap();
    expect(value.mfcItemId).toBe(ITEM.mfcItemId);
    expect(value.title).toBe("The title");
    expect(value.picture).toEqual({ base64: JPEG.toBase64(), contentType: "image/jpeg" });
    expect(pickCaptureSchema.safeParse(value).success).toBe(true);
  });

  test("captures a public Item through the same address", async () => {
    const fetch = jpegFetch();

    const captured = await capture(PUBLIC_ITEM, fetch);

    expect(captured.unwrap().picture?.contentType).toBe("image/jpeg");
    expect(fetch.mock.calls[0]?.[0].searchParams.get("objectId")).toBe("98777");
  });

  test("leaves the signed-in user out of the page, even a panel MFC added after load", async () => {
    const page = pageAt(ITEM_98777);
    expect(page.document.documentElement.outerHTML).toContain("fixture_user");
    const panel = page.document.createElement("div");
    panel.innerHTML = '<a href="/profile/fixture_user">fixture_user wrote to you</a>';
    page.document.body.append(panel);

    const captured = await capturePage(page.document, ITEM, {
      fetch: jpegFetch(),
      origins: ORIGINS,
    });
    const { html } = captured.unwrap();

    expect(html).not.toContain("fixture_user");
    expect(html).not.toContain("/profile/");
    expect(html).not.toContain("<script");
  });

  test("holds nothing of the toggle: a host with a closed root serializes empty", async () => {
    const page = pageAt(ITEM_98777);
    const host = page.document.createElement("div");
    host.dataset["myakibaPick"] = "toggle";
    host.attachShadow({ mode: "closed" }).innerHTML = "<button>Pick for myakiba</button>";
    page.document.body.append(host);

    const captured = await capturePage(page.document, ITEM, {
      fetch: jpegFetch(),
      origins: ORIGINS,
    });
    const { html } = captured.unwrap();

    expect(html).not.toContain("Pick for myakiba");
  });

  test("refuses a page whose canonical link names another Item, without a request", async () => {
    const fetch = jpegFetch();

    const captured = await capture(
      edit(
        ITEM_98777,
        'rel="canonical" href="https://myfigurecollection.net/item/98777"',
        'rel="canonical" href="https://myfigurecollection.net/item/98778"',
      ),
      fetch,
    );

    expect(captured.isErr() && captured.error.reason).toBe("wrong_item");
    expect(fetch).not.toHaveBeenCalled();
  });

  test("refuses a page that does not read as an Item, without a request", async () => {
    const fetch = jpegFetch();

    const captured = await capture(
      edit(
        ITEM_98777,
        'rel="canonical" href="https://myfigurecollection.net/item/98777"',
        'rel="canonical" href="https://myfigurecollection.net/"',
      ),
      fetch,
    );

    expect(captured.isErr() && captured.error.reason).toBe("not_an_item_page");
    expect(fetch).not.toHaveBeenCalled();
  });

  test("refuses a page showing MFC's SFW placeholder, without a request", async () => {
    const fetch = jpegFetch();

    const captured = await capture(edit(ITEM_98777, ogImageOf(ITEM_98777), SFW_IMAGE), fetch);

    expect(captured.isErr() && captured.error.reason).toBe("sfw_hidden");
    expect(fetch).not.toHaveBeenCalled();
  });

  const failures = [
    ["a network failure", () => Promise.reject(new TypeError("Failed to fetch"))],
    ["an error status", async () => new Response("no", { status: 404 })],
    ["an answer that is no image", async () => new Response("<html>challenge</html>")],
    ["an answer with no bytes", async () => new Response(new Uint8Array())],
  ] as const satisfies readonly (readonly [string, PageFetch])[];

  test.each(failures)("still picks without a picture after %s, and logs it", async (_, fetch) => {
    const captured = await capture(ITEM_98777, mock(fetch));

    expect(captured.unwrap().picture).toBeNull();
    expect(captured.unwrap().html).toContain("<html");
    expect(consoleWarn).toHaveBeenCalledTimes(1);
    expect(String(consoleWarn.mock.calls[0]?.[0])).toStartWith("CapturePictureFailed:");
  });
});
