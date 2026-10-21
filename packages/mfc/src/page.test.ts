import { describe, expect, test } from "bun:test";
import { edit, fixture, itemId } from "../test/fixtures";
import { mfcItemId, readMfcEnvelope } from "./page";

const GATED_98777 =
  "https://myfigurecollection.net/?_tb=commit&commit=nsp&objectType=item&objectId=98777&size=1";
const OG_IMAGE_98777 =
  '<meta property="og:image" content="https://myfigurecollection.net/?_tb=commit&amp;commit=nsp&amp;objectType=item&amp;objectId=98777&amp;size=1"/>';

const item98777 = await fixture("item-98777.html");
const ID_98777 = itemId(98_777);

function envelopeOf(html: string, status = 200, cfMitigated: string | null = null) {
  return readMfcEnvelope({ status, cfMitigated, html });
}

function withOgImage(url: string): string {
  return edit(item98777, OG_IMAGE_98777, `<meta property="og:image" content="${url}">`);
}

describe("mfcItemId", () => {
  test("accepts positive 32-bit integers", () => {
    expect<number | null>(mfcItemId(1)).toBe(1);
    expect<number | null>(mfcItemId(98_777)).toBe(98_777);
    expect<number | null>(mfcItemId(2 ** 31 - 1)).toBe(2 ** 31 - 1);
  });

  test.each([0, -1, 1.5, 2 ** 31, Number.NaN, Infinity])("rejects %p", (value) => {
    expect(mfcItemId(value)).toBeNull();
  });

  test("rejects a numeric string at compile time and at runtime", () => {
    // @ts-expect-error mfcItemId takes a number, so a string id cannot reach it unparsed.
    expect(mfcItemId("98777")).toBeNull();
  });
});

describe("readMfcEnvelope on the signed-in 98777 page", () => {
  test("reads the canonical id, the signed-in menu and the gated og:image", () => {
    expect(envelopeOf(item98777)).toEqual({
      kind: "item",
      mfcItemId: ID_98777,
      signedIn: true,
      picture: { access: "gated", url: GATED_98777 },
    });
  });

  test("a cf-mitigated challenge header wins over the body", () => {
    expect(envelopeOf(item98777, 403, "challenge")).toEqual({ kind: "challenge" });
  });

  test("a challenge-platform script on a normal page is not a challenge", () => {
    const html = edit(
      item98777,
      "</body>",
      '<script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script></body>',
    );
    expect(envelopeOf(html).kind).toBe("item");
  });

  test("a comment quoting the not-found sentence leaves it an item page", () => {
    const html = edit(
      item98777,
      "</footer>",
      "<p>The page you requested was not found</p></footer>",
    );
    expect(envelopeOf(html).kind).toBe("item");
  });

  test("a non-200 status with item markup is unexpected", () => {
    expect(envelopeOf(item98777, 500)).toEqual({ kind: "unexpected", status: 500 });
  });
});

describe("readMfcEnvelope on pages derived from item-98777.html", () => {
  test("derived public item: signed out, static og:image", async () => {
    expect(envelopeOf(await fixture("derived-public-item.html"))).toEqual({
      kind: "item",
      mfcItemId: ID_98777,
      signedIn: false,
      picture: {
        access: "public",
        url: "https://static.myfigurecollection.net/upload/items/1/98777-a1b2c.jpg",
      },
    });
  });

  test("derived challenge page", async () => {
    expect(envelopeOf(await fixture("derived-challenge.html"), 403)).toEqual({
      kind: "challenge",
    });
  });

  test("derived signed-in 404", async () => {
    const html = await fixture("derived-not-found-signed-in.html");
    expect(envelopeOf(html, 404)).toEqual({ kind: "not_found", signedIn: true });
    expect(envelopeOf(html, 200)).toEqual({ kind: "not_found", signedIn: true });
  });

  test("derived signed-out 404", async () => {
    const html = await fixture("derived-not-found-signed-out.html");
    expect(envelopeOf(html, 404)).toEqual({ kind: "not_found", signedIn: false });
    expect(envelopeOf(html, 200)).toEqual({ kind: "not_found", signedIn: false });
  });
});

describe("readMfcEnvelope on other responses", () => {
  test("a 200 without a canonical item link is unexpected", () => {
    expect(envelopeOf("<html><head></head><body>hello</body></html>")).toEqual({
      kind: "unexpected",
      status: 200,
    });
  });

  test("a canonical link to a non-item page is unexpected", () => {
    const html = edit(
      item98777,
      'href="https://myfigurecollection.net/item/98777"',
      'href="https://myfigurecollection.net/entry/98777"',
    );
    expect(envelopeOf(html)).toEqual({ kind: "unexpected", status: 200 });
  });
});

describe("picture choice", () => {
  test("public pictures must live under /upload/items/ on the static host", () => {
    expect(
      envelopeOf(withOgImage("https://static.myfigurecollection.net/upload/users/1/1.jpg")),
    ).toMatchObject({ kind: "item", picture: null });
  });

  test.each([
    [
      "another item's gated picture",
      "https://myfigurecollection.net/?_tb=commit&amp;commit=nsp&amp;objectType=item&amp;objectId=98778&amp;size=1",
    ],
    [
      "plain http",
      "http://myfigurecollection.net/?_tb=commit&amp;commit=nsp&amp;objectType=item&amp;objectId=98777&amp;size=1",
    ],
    ["another host", "https://static.example.com/upload/items/1/98777.jpg"],
    ["a port", "https://static.myfigurecollection.net:8443/upload/items/1/98777.jpg"],
    ["credentials", "https://user:pass@static.myfigurecollection.net/upload/items/1/98777.jpg"],
    [
      "a path escaping /upload/items/",
      "https://static.myfigurecollection.net/upload/items/../users/1.jpg",
    ],
    ["not a URL", "not a url"],
  ])("drops %s", (_, url) => {
    expect(envelopeOf(withOgImage(url))).toMatchObject({ kind: "item", picture: null });
  });

  test("no og:image means no picture", () => {
    expect(envelopeOf(edit(item98777, OG_IMAGE_98777, ""))).toMatchObject({
      kind: "item",
      picture: null,
    });
  });
});
